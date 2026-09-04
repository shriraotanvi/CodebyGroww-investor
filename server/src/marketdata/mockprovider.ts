import { SYMBOL_UNIVERSE, NIFTY50_META, NIFTY50_SYMBOL, SECTORS, type SymbolMeta, type Sector } from "../symbols.js";
import type { MarketDataProvider, Quote } from "./provider.js";
import { getDailyHistory } from "../dailyHistory.js";

// Simulator design: a single-factor model, same shape a real quant desk
// would use to explain "why did this stock move." Every tick we draw:
//   - one shared marketFactor  (drives NIFTY 50 and, scaled by beta, every stock)
//   - one sectorFactor per sector (shared across that sector's stocks)
//   - one idiosyncratic shock per stock
// A stock's return = beta*marketFactor + sectorFactor[sector] + idiosyncratic.
// This is what makes "outperformed NIFTY" and "outperformed its sector"
// meaningful signals instead of decoration: they're literally residuals
// against factors we generated, not something bolted on after the fact.
interface SimState {
  meta: SymbolMeta;
  price: number;
  open: number;
  prevClose: number;
  dayHigh: number;
  dayLow: number;
  high52w: number;
  low52w: number;
  avgVolume: number;
  cumVolume: number;
  drift: number; // short-lived directional bias from a simulated event, decays over time
  lastTs: number;
}

const ALL_META: SymbolMeta[] = [NIFTY50_META, ...SYMBOL_UNIVERSE];
const STATE = new Map<string, SimState>();

function seedState(meta: SymbolMeta): SimState {
  const open = meta.basePrice * (1 + (Math.random() - 0.5) * 0.01);

  // 52w high/low are derived from the actual generated daily history
  // (dailyHistory.ts) rather than an independent random guess, so the
  // "new 52-week high/low" signal in attention scoring is consistent with
  // what the chart shows, not decorative.
  const yearBars = getDailyHistory(meta.symbol, "1Y");
  const highs = yearBars.map((b) => b.high);
  const lows = yearBars.map((b) => b.low);
  const high52w = highs.length > 0 ? Math.max(...highs, open) : meta.basePrice * 1.15;
  const low52w = lows.length > 0 ? Math.min(...lows, open) : meta.basePrice * 0.85;

  return {
    meta,
    price: open,
    open,
    prevClose: meta.basePrice * (1 + (Math.random() - 0.5) * 0.015),
    dayHigh: open,
    dayLow: open,
    high52w,
    low52w,
    avgVolume: Math.round((meta.assetClass === "index" ? 0 : 3_000_000) * (0.5 + Math.random()) + (meta.assetClass === "index" ? 0 : 1_000_000)),
    cumVolume: 0,
    drift: 0,
    lastTs: Date.now(),
  };
}

for (const meta of ALL_META) STATE.set(meta.symbol, seedState(meta));

const sectorFactorState = new Map<Sector, number>(SECTORS.map((s) => [s, 0]));

// A snapshot of the market at boot, taken before any tick or fast-forward
// has run. This is what "Reset simulation" restores to — so trying +4h,
// deciding you'd rather see +8h instead, means resetting back to a known
// baseline rather than the two runs stacking into an inaccurate 12h.
interface MarketSnapshot {
  states: Map<string, SimState>;
  sectorFactors: Map<Sector, number>;
}

function captureSnapshot(): MarketSnapshot {
  return {
    states: new Map([...STATE].map(([symbol, s]) => [symbol, { ...s }])),
    sectorFactors: new Map(sectorFactorState),
  };
}

const BOOT_SNAPSHOT = captureSnapshot();
export const BOOT_TS = Date.now();

/** Restores every symbol (and sector factor) to exactly the boot-time snapshot. */
export function resetToBootSnapshot(): void {
  const now = Date.now();
  for (const [symbol, s] of BOOT_SNAPSHOT.states) {
    STATE.set(symbol, { ...s, lastTs: now });
  }
  sectorFactorState.clear();
  for (const [sector, v] of BOOT_SNAPSHOT.sectorFactors) sectorFactorState.set(sector, v);
}

function gaussian(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface ShockEvent {
  symbol: string;
  direction: "up" | "down";
  magnitude: number; // abs pct of the drift injected
}

// A shock's `drift` decays with a fixed *half-life in minutes*, not a fixed
// per-tick multiplier — that's what makes total contribution
// discretization-invariant: whether it's applied across 4-second real ticks
// or 5-minute fast-forward steps, the sum telescopes to the same total
// magnitude. (An earlier version used `drift *= 0.9` per tick with
// `drift * min(1, dtMinutes)` applied — correct at ~0.07-minute real ticks,
// but at 5-minute fast-forward steps it applied ~15x too much of each
// shock's magnitude per step, producing runaway 40%+ moves. This form fixes
// that at any step size.)
const DRIFT_HALF_LIFE_MINUTES = 6;
const DRIFT_DECAY_PER_MINUTE = Math.pow(0.5, 1 / DRIFT_HALF_LIFE_MINUTES);

/** Advances one symbol's price by dtMinutes, given this tick's shared market/sector factors. Returns a ShockEvent if a fresh shock fired this step. */
function advanceSymbol(s: SimState, dtMinutes: number, marketFactor: number, sectorFactor: Map<Sector, number>): ShockEvent | null {
  let shock: ShockEvent | null = null;

  // Rare simulated corporate/news event shock (see events.ts for the
  // matching headline generator) — gives clear "why did this move" moments.
  if (s.meta.assetClass === "equity" && Math.random() < 0.0025) {
    const magnitude = 0.02 + Math.random() * 0.06;
    const direction = Math.random() < 0.5 ? -1 : 1;
    s.drift = direction * magnitude;
    shock = { symbol: s.meta.symbol, direction: direction > 0 ? "up" : "down", magnitude };
  }

  // The fraction of remaining drift that decays away within this step,
  // applied to price now; the rest carries forward to decay further later.
  const decayFactor = Math.pow(DRIFT_DECAY_PER_MINUTE, dtMinutes);
  const driftContribution = s.drift * (1 - decayFactor);
  s.drift *= decayFactor;

  let pctMove: number;
  if (s.meta.symbol === NIFTY50_SYMBOL) {
    pctMove = marketFactor * Math.sqrt(dtMinutes);
  } else {
    const idiosyncraticVol = Math.max(0.0008, s.meta.volatility / Math.sqrt(252 * 6.5 * 60)) * 0.7;
    const idiosyncratic = gaussian() * idiosyncraticVol * Math.sqrt(dtMinutes);
    pctMove =
      s.meta.beta * marketFactor * Math.sqrt(dtMinutes) +
      (sectorFactor.get(s.meta.sector) ?? 0) * Math.sqrt(dtMinutes) +
      idiosyncratic +
      driftContribution;
  }

  s.price = Math.max(0.01, s.price * (1 + pctMove));
  s.dayHigh = Math.max(s.dayHigh, s.price);
  s.dayLow = Math.min(s.dayLow, s.price);
  s.high52w = Math.max(s.high52w, s.price);
  s.low52w = Math.min(s.low52w, s.price);

  if (s.meta.assetClass === "equity") {
    const baseStepVolume = (s.avgVolume / ((6.5 * 60) / dtMinutes)) * (0.3 + Math.random() * 1.4);
    const spikeMultiplier = Math.abs(s.drift) > 0.001 ? 3 + Math.random() * 4 : 1;
    s.cumVolume += baseStepVolume * spikeMultiplier;
  }

  return shock;
}

function drawSectorFactors(marketVol: number): Map<Sector, number> {
  // Sector factors mean-revert around 0 with their own noise, so a sector
  // can trend independently of the broad market for a while.
  const sectorFactor = new Map<Sector, number>();
  for (const sector of SECTORS) {
    const prev = sectorFactorState.get(sector) ?? 0;
    const next = prev * 0.85 + gaussian() * (marketVol * 0.6);
    sectorFactorState.set(sector, next);
    sectorFactor.set(sector, next);
  }
  return sectorFactor;
}

/** Advances the whole market (index, sectors, stocks) by one tick. Returns any symbols that just got a fresh event-shock this tick, so a matching headline can be generated (see events.ts). */
export function stepMarket(): ShockEvent[] {
  const now = Date.now();
  const shocks: ShockEvent[] = [];

  const marketVol = NIFTY50_META.volatility / Math.sqrt(252 * 6.5 * 60);
  const marketFactor = gaussian() * marketVol;
  const sectorFactor = drawSectorFactors(marketVol);

  for (const s of STATE.values()) {
    const dtMinutes = Math.max(0.05, (now - s.lastTs) / 60000);
    s.lastTs = now;
    const shock = advanceSymbol(s, dtMinutes, marketFactor, sectorFactor);
    if (shock) shocks.push(shock);
  }

  return shocks;
}

export interface TimedShockEvent extends ShockEvent {
  occurredAt: number;
}

// Demo/time-travel control: compresses N simulated hours into a single
// synchronous call instead of waiting on the real 4s tick loop. Uses
// coarser 5-minute steps rather than replaying every 4s tick — Brownian
// motion's variance scales with sqrt(dt) regardless of step size, so this
// produces statistically equivalent price paths to "actually waiting" while
// running orders of magnitude fewer iterations. This is what powers the
// "since you last checked" demo: your baseline doesn't move, only the
// market does, so returning after a fast-forward reproduces exactly the
// experience of checking back after a real absence.
const FAST_FORWARD_STEP_MINUTES = 5;
const MAX_FAST_FORWARD_HOURS = 24 * 30; // 30 days, sanity cap

export function fastForwardMarket(hours: number): TimedShockEvent[] {
  const clampedHours = Math.max(0, Math.min(hours, MAX_FAST_FORWARD_HOURS));
  const numSteps = Math.max(1, Math.round((clampedHours * 60) / FAST_FORWARD_STEP_MINUTES));

  // Events get timestamps clustered at (approximately) the real "now" —
  // NOT backdated across the simulated window. Backdating them into the
  // past seems more realistic at first glance, but every user's baseline
  // ("last checked") is a real wall-clock timestamp captured moments before
  // this call, and events stamped in the past would land *before* that
  // baseline — silently excluded from "what changed since you checked" by
  // the occurredAt > baseline.capturedAt filter, so the attention score's
  // event signal would never fire despite events clearly having happened.
  // Stamping them at "now" (a few ms apart, only to keep ordering stable)
  // guarantees they land after any baseline captured before this call.
  const now = Date.now();

  const shocks: TimedShockEvent[] = [];
  const marketVol = NIFTY50_META.volatility / Math.sqrt(252 * 6.5 * 60);
  const dtMinutes = FAST_FORWARD_STEP_MINUTES;

  for (let step = 0; step < numSteps; step++) {
    const stepTs = now + step;
    const marketFactor = gaussian() * marketVol;
    const sectorFactor = drawSectorFactors(marketVol);

    for (const s of STATE.values()) {
      const shock = advanceSymbol(s, dtMinutes, marketFactor, sectorFactor);
      if (shock) shocks.push({ ...shock, occurredAt: stepTs });
    }
  }

  // Real time didn't pass, but the fast-forward should read as "current"
  // going forward — otherwise every symbol would immediately show as stale.
  for (const s of STATE.values()) s.lastTs = now;

  // A jump of 6+ hours plausibly crosses into a new trading session — roll
  // open/prevClose/day-range so "today" reflects the new session instead of
  // showing a stale multi-day cumulative number mislabeled as "today".
  // (The attention score is unaffected either way — it compares against
  // each user's own baseline, not the day's open.)
  if (clampedHours >= 6) rollNewSession();

  return shocks;
}

export class MockProvider implements MarketDataProvider {
  name = "mock" as const;

  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    const out = new Map<string, Quote>();
    for (const symbol of symbols) {
      const s = STATE.get(symbol);
      if (!s) continue;
      out.set(symbol, {
        symbol,
        price: round2(s.price),
        prevClose: round2(s.prevClose),
        open: round2(s.open),
        dayHigh: round2(s.dayHigh),
        dayLow: round2(s.dayLow),
        high52w: round2(s.high52w),
        low52w: round2(s.low52w),
        volume: Math.round(s.cumVolume),
        avgVolume: Math.round(s.avgVolume),
        ts: Date.now(),
        source: "mock",
      });
    }
    return out;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function rollNewSession(): void {
  for (const s of STATE.values()) {
    s.prevClose = s.price;
    s.open = s.price * (1 + (Math.random() - 0.5) * 0.005);
    s.dayHigh = s.open;
    s.dayLow = s.open;
    s.cumVolume = 0;
  }
}

export function allSimSymbols(): string[] {
  return ALL_META.map((m) => m.symbol);
}
