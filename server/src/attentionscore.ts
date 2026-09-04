import { SYMBOL_MAP } from "./symbols.js";
import type { EnrichedQuote } from "./marketData/engine.js";
import type { MarketEvent } from "./events.js";

// This is the product's core differentiator: instead of "price moved X%,"
// every watched stock gets an explainable 0-100 ATTENTION SCORE built from
// several independent signals, each individually true or false/graded, with
// a plain-English "why it matters" sentence generated from whichever
// signals actually fired. No single number here is "the" signal — the
// score is a *sum of evidence*, which is what makes it explainable instead
// of a black box.
export type AttentionTier = "none" | "minor" | "notable" | "major";

export interface BaselineSnapshot {
  price: number;
  high52w: number;
  low52w: number;
  volume: number;
  avgVolume: number;
  niftyPrice: number | null;
  sectorIndexLevel: number | null;
  capturedAt: number;
}

export interface AttentionSignal {
  key:
    | "price_move"
    | "volume"
    | "volatility"
    | "vs_nifty"
    | "vs_sector"
    | "52w_high"
    | "52w_low"
    | "event";
  label: string;
  points: number; // contribution to the final score, for transparency/debugging
}

export interface AttentionResult {
  symbol: string;
  score: number; // 0-100
  tier: AttentionTier;
  pctChange: number; // since baseline
  absChange: number;
  signals: AttentionSignal[];
  reasons: string[]; // short bullet strings, UI-ready
  whyItMatters: string; // one narrative sentence
  events: MarketEvent[]; // events since baseline that contributed
  baselineAgeMs: number;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function returnsFromHistory(history: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i - 1] > 0) out.push(history[i] / history[i - 1] - 1);
  }
  return out;
}

export function computeAttentionScore(params: {
  current: EnrichedQuote;
  baseline: BaselineSnapshot | null;
  niftyReturnSinceBaseline: number | null; // NIFTY's own pct return over the same window, or null if unavailable
  sectorReturnSinceBaseline: number | null;
  eventsSinceBaseline: MarketEvent[];
  // Count of times the user has told this symbol "not interesting" — each
  // one raises the bar for what counts as attention-worthy going forward.
  // This is what makes triage feel like it's actually learning, not just
  // hiding the current alert once.
  dampen?: number;
}): AttentionResult {
  const { current, baseline, niftyReturnSinceBaseline, sectorReturnSinceBaseline, eventsSinceBaseline, dampen = 0 } = params;
  const meta = SYMBOL_MAP.get(current.symbol);
  const volatility = meta?.volatility ?? 0.2;

  if (!baseline) {
    return {
      symbol: current.symbol,
      score: 0,
      tier: "none",
      pctChange: 0,
      absChange: 0,
      signals: [],
      reasons: ["Just added — no baseline to compare against yet."],
      whyItMatters: "You'll see how this moves once you've checked it at least once before.",
      events: [],
      baselineAgeMs: 0,
    };
  }

  const pctChange = baseline.price > 0 ? current.price / baseline.price - 1 : 0;
  const absChange = current.price - baseline.price;
  const unit = Math.max(0.006, volatility * 0.045); // "one unit of move" for this symbol's typical volatility

  const signals: AttentionSignal[] = [];
  const reasons: string[] = [];
  let score = 0;

  // 1. Raw price magnitude, volatility-scaled (up to 55 pts)
  const magnitudeRatio = Math.abs(pctChange) / unit;
  const priceMoveIsReal = magnitudeRatio >= 0.35;
  if (priceMoveIsReal) {
    const pricePts = Math.min(55, magnitudeRatio * 16);
    score += pricePts;
    signals.push({ key: "price_move", label: `${pctChange >= 0 ? "Up" : "Down"} ${Math.abs(pctChange * 100).toFixed(2)}% since your last visit`, points: Math.round(pricePts) });
    reasons.push(`Price moved ${Math.abs(pctChange * 100).toFixed(2)}% — ${magnitudeRatio >= 2 ? "large" : "meaningful"} relative to its usual volatility`);
  }

  // 2. Relative volume (up to 18 pts)
  const volumeRatio = current.avgVolume > 0 ? current.volume / current.avgVolume : 0;
  if (volumeRatio > 1.5 && priceMoveIsReal) {
    const volPts = Math.min(18, 6 + (volumeRatio - 1.5) * 8);
    score += volPts;
    signals.push({ key: "volume", label: `Volume is ${volumeRatio.toFixed(1)}x normal`, points: Math.round(volPts) });
    reasons.push(`Volume is ${volumeRatio.toFixed(1)}x normal — the move has real participation behind it`);
  }

  // 3. Realized volatility spike vs this symbol's expected volatility (up to 10 pts)
  const recentReturns = returnsFromHistory(current.history);
  if (recentReturns.length >= 8) {
    const realizedVol = stddev(recentReturns);
    const expectedTickVol = volatility / Math.sqrt(252 * 6.5 * 60);
    const volRatio = expectedTickVol > 0 ? realizedVol / expectedTickVol : 1;
    if (volRatio > 1.8) {
      const volatilityPts = Math.min(10, (volRatio - 1.8) * 6);
      score += volatilityPts;
      signals.push({ key: "volatility", label: "Trading more erratically than usual", points: Math.round(volatilityPts) });
      reasons.push("Short-term volatility is well above normal for this stock");
    }
  }

  // 4. Performance vs NIFTY 50 (up to 15 pts)
  if (niftyReturnSinceBaseline !== null) {
    const relOutperformance = pctChange - niftyReturnSinceBaseline;
    if (Math.abs(relOutperformance) >= 0.008 && priceMoveIsReal) {
      const niftyPts = Math.min(15, Math.abs(relOutperformance) * 260);
      score += niftyPts;
      const verb = relOutperformance >= 0 ? "Outperformed" : "Underperformed";
      signals.push({ key: "vs_nifty", label: `${verb} NIFTY 50 by ${Math.abs(relOutperformance * 100).toFixed(2)}pp`, points: Math.round(niftyPts) });
      reasons.push(`${verb} the NIFTY 50 by ${Math.abs(relOutperformance * 100).toFixed(2)} percentage points`);
    }
  }

  // 5. Performance vs sector (up to 15 pts)
  if (sectorReturnSinceBaseline !== null) {
    const relSector = pctChange - sectorReturnSinceBaseline;
    if (Math.abs(relSector) >= 0.008 && priceMoveIsReal) {
      const sectorPts = Math.min(15, Math.abs(relSector) * 260);
      score += sectorPts;
      const verb = relSector >= 0 ? "Outperformed" : "Underperformed";
      signals.push({ key: "vs_sector", label: `${verb} its sector by ${Math.abs(relSector * 100).toFixed(2)}pp`, points: Math.round(sectorPts) });
      reasons.push(`${verb} its sector peers by ${Math.abs(relSector * 100).toFixed(2)} percentage points`);
    }
  }

  // 6. 52-week high/low crossing (up to 20 pts) — structurally significant regardless of magnitude
  const newHigh52w = current.price >= baseline.high52w && current.price > baseline.price;
  const newLow52w = current.price <= baseline.low52w && current.price < baseline.price;
  if (newHigh52w) {
    score += 20;
    signals.push({ key: "52w_high", label: "New 52-week high", points: 20 });
    reasons.push("Just hit a new 52-week high");
  }
  if (newLow52w) {
    score += 20;
    signals.push({ key: "52w_low", label: "New 52-week low", points: 20 });
    reasons.push("Just hit a new 52-week low");
  }

  // 7. Corporate events / news since baseline (up to 25 pts)
  const relevantEvents = eventsSinceBaseline.slice(0, 3);
  if (relevantEvents.length > 0) {
    const topEvent = relevantEvents.reduce((a, b) => (b.importance > a.importance ? b : a));
    const eventPts = Math.min(25, topEvent.importance * 25);
    score += eventPts;
    signals.push({ key: "event", label: topEvent.headline, points: Math.round(eventPts) });
    reasons.push(`New company event: "${topEvent.headline}"`);
  }

  score = Math.round(Math.min(100, score));

  // Each "not interesting" damps the score by another ~35% — so a symbol
  // the user has repeatedly dismissed needs a proportionally bigger move to
  // earn its way back into the inbox, rather than reappearing at full
  // volume every time.
  if (dampen > 0) score = Math.round(score / (1 + dampen * 0.35));

  // An event alone, with an effectively-zero price move, isn't something
  // worth interrupting someone for — the badge would show "+0.00%" next to
  // a "Minor" tier, which reads as a bug, not a signal. Require a real
  // price move or a 52-week crossing before any tier above "none" fires;
  // the event still contributes its points to the score/reasons for
  // context, it just can't carry a tier on its own.
  const hasQualifyingMove = priceMoveIsReal || newHigh52w || newLow52w;
  let tier: AttentionTier = "none";
  if (hasQualifyingMove) {
    if (score >= 65) tier = "major";
    else if (score >= 35) tier = "notable";
    else if (score >= 12) tier = "minor";
  }

  if (reasons.length === 0) reasons.push("Essentially flat — within normal noise for this stock");

  const whyItMatters = buildNarrative({
    symbol: current.symbol,
    name: meta?.name ?? current.symbol,
    pctChange,
    tier,
    outperformedNifty: niftyReturnSinceBaseline !== null && pctChange - niftyReturnSinceBaseline >= 0.008,
    underperformedNifty: niftyReturnSinceBaseline !== null && pctChange - niftyReturnSinceBaseline <= -0.008,
    volumeSpike: volumeRatio > 1.5 && priceMoveIsReal,
    newHigh52w,
    newLow52w,
    topEvent: relevantEvents[0] ?? null,
  });

  return {
    symbol: current.symbol,
    score,
    tier,
    pctChange: Math.round(pctChange * 10000) / 10000,
    absChange: Math.round(absChange * 100) / 100,
    signals,
    reasons,
    whyItMatters,
    events: relevantEvents,
    baselineAgeMs: Date.now() - baseline.capturedAt,
  };
}

function buildNarrative(p: {
  symbol: string;
  name: string;
  pctChange: number;
  tier: AttentionTier;
  outperformedNifty: boolean;
  underperformedNifty: boolean;
  volumeSpike: boolean;
  newHigh52w: boolean;
  newLow52w: boolean;
  topEvent: MarketEvent | null;
}): string {
  if (p.tier === "none") return `${p.name} has been quiet since your last visit — nothing here needs your attention right now.`;

  const direction = p.pctChange >= 0 ? "strong upward" : "notable downward";

  if (p.newHigh52w) return `${p.name} just broke out to a new 52-week high, which is often a sign of strong momentum continuing.`;
  if (p.newLow52w) return `${p.name} just fell to a new 52-week low, which is worth understanding before you act.`;

  if (p.topEvent) {
    // The event and the net price move can disagree — e.g. a stock can beat
    // earnings yet still close down if the broader market or sector sold
    // off harder. Phrasing that as "down ... following positive news" would
    // read as a contradiction, so when they don't agree, say so explicitly
    // instead of implying the event caused the move.
    const eventIsBullish = p.topEvent.sentiment === "positive";
    const eventIsBearish = p.topEvent.sentiment === "negative";
    const moveAgreesWithEvent = (eventIsBullish && p.pctChange >= 0) || (eventIsBearish && p.pctChange < 0);

    if (moveAgreesWithEvent) {
      const cause = eventIsBullish ? "following positive news" : "after negative news";
      return `${p.name} is showing ${direction} movement ${cause}: "${p.topEvent.headline}."`;
    }
    if (eventIsBullish || eventIsBearish) {
      return `${p.name} moved ${Math.abs(p.pctChange * 100).toFixed(1)}% since your last visit despite ${
        eventIsBullish ? "positive" : "negative"
      } news ("${p.topEvent.headline}") — broader market or sector forces look like they're dominating here.`;
    }
    return `${p.name} is showing ${direction} movement, with "${p.topEvent.headline}" also in play.`;
  }

  if ((p.outperformedNifty || p.underperformedNifty) && p.volumeSpike) {
    const rel = p.outperformedNifty ? "significantly outperforming the broader market" : "significantly lagging the broader market";
    return `${p.name} is showing unusually strong activity and is ${rel}.`;
  }

  if (p.volumeSpike) return `${p.name} is trading on unusually heavy volume alongside a ${direction} move — worth a closer look.`;
  if (p.outperformedNifty) return `${p.name} is outperforming the NIFTY 50 by a meaningful margin since you last checked.`;
  if (p.underperformedNifty) return `${p.name} is lagging the NIFTY 50 by a meaningful margin since you last checked.`;

  return `${p.name} has moved ${Math.abs(p.pctChange * 100).toFixed(1)}% since your last visit — a bigger move than usual for this stock.`;
}

export const ATTENTION_TIER_RANK: Record<AttentionTier, number> = { major: 3, notable: 2, minor: 1, none: 0 };
