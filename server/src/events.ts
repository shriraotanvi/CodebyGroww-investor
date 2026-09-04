import { query, queryOne } from "./db.js";
import { SYMBOL_MAP, SYMBOL_UNIVERSE } from "./symbols.js";
import type { ShockEvent, TimedShockEvent } from "./marketData/mockProvider.js";

export type EventSentiment = "positive" | "negative" | "neutral";
export type EventType = "earnings" | "dividend" | "buyback" | "board_meeting" | "rating_change" | "guidance" | "regulatory" | "news";

export interface MarketEvent {
  id: number;
  symbol: string;
  type: EventType;
  headline: string;
  detail: string;
  sentiment: EventSentiment;
  importance: number; // 0..1, used as a weight in attention scoring
  occurredAt: number;
}

interface EventRow {
  id: number;
  symbol: string;
  type: EventType;
  headline: string;
  detail: string;
  sentiment: EventSentiment;
  importance: number;
  occurred_at: number;
}

function rowToEvent(r: EventRow): MarketEvent {
  return {
    id: r.id,
    symbol: r.symbol,
    type: r.type,
    headline: r.headline,
    detail: r.detail,
    sentiment: r.sentiment,
    importance: r.importance,
    occurredAt: Number(r.occurred_at),
  };
}

async function insertEvent(row: {
  symbol: string;
  type: EventType;
  headline: string;
  detail: string;
  sentiment: EventSentiment;
  importance: number;
  occurred_at: number;
}): Promise<void> {
  await query(
    `INSERT INTO events (symbol, type, headline, detail, sentiment, importance, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [row.symbol, row.type, row.headline, row.detail, row.sentiment, row.importance, row.occurred_at]
  );
}

// Headline templates keyed by whether the underlying move was up or down —
// this is what lets a generated event read as plausibly *causal* for the
// price move it's attached to, e.g. "beat estimates" pairs with an up move.
const UP_TEMPLATES: { type: EventType; headline: (name: string) => string; detail: string; sentiment: EventSentiment; importance: number }[] = [
  { type: "earnings", headline: (n) => `${n} beats quarterly earnings estimates`, detail: "Net profit and revenue both came in ahead of analyst consensus for the quarter.", sentiment: "positive", importance: 0.9 },
  { type: "guidance", headline: (n) => `${n} raises full-year guidance`, detail: "Management raised its full-year revenue and margin guidance, citing stronger-than-expected demand.", sentiment: "positive", importance: 0.85 },
  { type: "rating_change", headline: (n) => `Brokerage upgrades ${n} to 'Buy'`, detail: "A leading brokerage raised its rating and price target, citing improving fundamentals.", sentiment: "positive", importance: 0.7 },
  { type: "buyback", headline: (n) => `${n} board approves share buyback`, detail: "The board approved a share buyback program, seen as a signal of management confidence.", sentiment: "positive", importance: 0.65 },
  { type: "news", headline: (n) => `${n} wins large new order`, detail: "The company announced a significant new order win, boosting its near-term revenue visibility.", sentiment: "positive", importance: 0.6 },
];

const DOWN_TEMPLATES: { type: EventType; headline: (name: string) => string; detail: string; sentiment: EventSentiment; importance: number }[] = [
  { type: "earnings", headline: (n) => `${n} misses quarterly earnings estimates`, detail: "Net profit came in below analyst consensus, with margin pressure cited as the key factor.", sentiment: "negative", importance: 0.9 },
  { type: "guidance", headline: (n) => `${n} cuts full-year guidance`, detail: "Management lowered its full-year outlook, citing weaker demand and cost pressures.", sentiment: "negative", importance: 0.85 },
  { type: "rating_change", headline: (n) => `Brokerage downgrades ${n} to 'Sell'`, detail: "A leading brokerage cut its rating, flagging valuation concerns and slowing growth.", sentiment: "negative", importance: 0.7 },
  { type: "regulatory", headline: (n) => `${n} faces regulatory scrutiny`, detail: "Regulators are reviewing certain business practices, creating near-term uncertainty.", sentiment: "negative", importance: 0.75 },
  { type: "news", headline: (n) => `${n} flags order delays`, detail: "The company disclosed delays impacting near-term execution and revenue recognition.", sentiment: "negative", importance: 0.55 },
];

const NEUTRAL_TEMPLATES: { type: EventType; headline: (name: string) => string; detail: string; sentiment: EventSentiment; importance: number }[] = [
  { type: "board_meeting", headline: (n) => `${n} schedules board meeting`, detail: "The board will meet to consider quarterly results and other business matters.", sentiment: "neutral", importance: 0.3 },
  { type: "dividend", headline: (n) => `${n} announces interim dividend`, detail: "The board declared an interim dividend, in line with prior periods.", sentiment: "neutral", importance: 0.35 },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Writes DB events matching this tick's simulated price shocks, so a big move always has a visible "why." */
export async function recordShockEvents(shocks: ShockEvent[]): Promise<void> {
  const now = Date.now();
  for (const shock of shocks) {
    const meta = SYMBOL_MAP.get(shock.symbol);
    if (!meta) continue;
    const templates = shock.direction === "up" ? UP_TEMPLATES : DOWN_TEMPLATES;
    const template = pick(templates);
    await insertEvent({
      symbol: shock.symbol,
      type: template.type,
      headline: template.headline(meta.name),
      detail: template.detail,
      sentiment: template.sentiment,
      importance: template.importance * (0.7 + shock.magnitude * 3),
      occurred_at: now,
    });
  }
}

/** Same as recordShockEvents, but for pre-timestamped shocks from a time-travel fast-forward — each event lands at the point in the simulated window it actually occurred, not "now". */
export async function recordTimedShockEvents(shocks: TimedShockEvent[]): Promise<void> {
  for (const shock of shocks) {
    const meta = SYMBOL_MAP.get(shock.symbol);
    if (!meta) continue;
    const templates = shock.direction === "up" ? UP_TEMPLATES : DOWN_TEMPLATES;
    const template = pick(templates);
    await insertEvent({
      symbol: shock.symbol,
      type: template.type,
      headline: template.headline(meta.name),
      detail: template.detail,
      sentiment: template.sentiment,
      importance: template.importance * (0.7 + shock.magnitude * 3),
      occurred_at: shock.occurredAt,
    });
  }
}

/** Backfills a plausible event history so a freshly-started demo isn't empty. Idempotent — only runs if the table is empty. */
export async function seedHistoricalEvents(): Promise<void> {
  const row = await queryOne<{ c: string }>("SELECT COUNT(*) as c FROM events");
  if (Number(row?.c ?? 0) > 0) return;

  const now = Date.now();
  for (const meta of SYMBOL_UNIVERSE) {
    const numEvents = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numEvents; i++) {
      const daysAgo = Math.random() * 25 + 1;
      const occurredAt = now - daysAgo * 24 * 60 * 60 * 1000;
      const roll = Math.random();
      const template = roll < 0.4 ? pick(UP_TEMPLATES) : roll < 0.8 ? pick(DOWN_TEMPLATES) : pick(NEUTRAL_TEMPLATES);
      await insertEvent({
        symbol: meta.symbol,
        type: template.type,
        headline: template.headline(meta.name),
        detail: template.detail,
        sentiment: template.sentiment,
        importance: template.importance,
        occurred_at: Math.round(occurredAt),
      });
    }
  }
}

export async function getEventsForSymbol(symbol: string, limit = 10): Promise<MarketEvent[]> {
  const rows = await query<EventRow>("SELECT * FROM events WHERE symbol = $1 ORDER BY occurred_at DESC LIMIT $2", [symbol, limit]);
  return rows.map(rowToEvent);
}

/** Used by "Reset simulation": removes only events generated by a fast-forward (timestamped after server boot), leaving the originally-seeded historical backdrop intact. */
export async function deleteEventsSince(sinceTs: number): Promise<void> {
  await query("DELETE FROM events WHERE occurred_at >= $1", [sinceTs]);
}

export async function getEventsSince(symbol: string, sinceTs: number): Promise<MarketEvent[]> {
  const rows = await query<EventRow>("SELECT * FROM events WHERE symbol = $1 AND occurred_at > $2 ORDER BY occurred_at DESC", [symbol, sinceTs]);
  return rows.map(rowToEvent);
}

export async function getRecentEventsAcross(symbols: string[], sinceTs: number): Promise<Map<string, MarketEvent[]>> {
  if (symbols.length === 0) return new Map();
  const placeholders = symbols.map((_, i) => `$${i + 1}`).join(",");
  const rows = await query<EventRow>(
    `SELECT * FROM events WHERE symbol IN (${placeholders}) AND occurred_at > $${symbols.length + 1} ORDER BY occurred_at DESC`,
    [...symbols, sinceTs]
  );
  const out = new Map<string, MarketEvent[]>();
  for (const r of rows) {
    const list = out.get(r.symbol) ?? [];
    list.push(rowToEvent(r));
    out.set(r.symbol, list);
  }
  return out;
}
