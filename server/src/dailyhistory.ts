import { SYMBOL_UNIVERSE, NIFTY50_META, type SymbolMeta } from "./symbols.js";

// Historical daily OHLC snapshots — separate from the live intraday tick
// engine (mockProvider.ts), which only keeps a short rolling buffer for
// sparklines. This is what backs multi-day/week/month/year chart ranges and
// is the concrete "historical snapshots" store the platform needs beyond
// just "the current price."
//
// Deterministically seeded per symbol (a simple PRNG, not Math.random) so
// the same history renders across server restarts instead of reshuffling
// on every reload — a real system would persist this in a time-series
// table/vendor instead of regenerating it, but determinism gets us the same
// user-facing property (stable charts) without that infrastructure.
export interface DailyBar {
  date: string; // YYYY-MM-DD
  close: number;
  high: number;
  low: number;
  volume: number;
}

const DAYS_OF_HISTORY = 400; // covers 1Y range plus buffer

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

function gaussianFrom(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generateSeries(meta: SymbolMeta): DailyBar[] {
  const rand = mulberry32(hashSeed(meta.symbol));
  const dailyVol = meta.volatility / Math.sqrt(252);
  const bars: DailyBar[] = [];

  // Walk backward from "today" so the most recent close lands near
  // basePrice (which the live engine also starts from), then reverse.
  let price = meta.basePrice;
  const today = new Date();
  for (let i = 0; i < DAYS_OF_HISTORY; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    // Skip weekends — NSE doesn't trade Sat/Sun.
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const open = price;
    const drift = (rand() - 0.5) * 0.001; // tiny long-run drift so charts aren't perfectly mean-reverting
    const pctMove = gaussianFrom(rand) * dailyVol + drift;
    const close = i === 0 ? price : price / (1 + pctMove); // walking backward: today's close is `price`, yesterday's is implied
    const high = Math.max(open, close) * (1 + rand() * dailyVol * 0.6);
    const low = Math.min(open, close) * (1 - rand() * dailyVol * 0.6);
    const volume = Math.round(
      (meta.assetClass === "index" ? 0 : 3_000_000) * (0.5 + rand()) * (1 + (Math.abs(pctMove) > dailyVol * 1.5 ? 1.5 : 0))
    );

    bars.push({ date: date.toISOString().slice(0, 10), close: round2(close), high: round2(high), low: round2(low), volume });
    price = close;
  }

  return bars.reverse();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CACHE = new Map<string, DailyBar[]>();

function getSeries(symbol: string): DailyBar[] {
  let cached = CACHE.get(symbol);
  if (!cached) {
    const meta = symbol === NIFTY50_META.symbol ? NIFTY50_META : SYMBOL_UNIVERSE.find((s) => s.symbol === symbol);
    if (!meta) return [];
    cached = generateSeries(meta);
    CACHE.set(symbol, cached);
  }
  return cached;
}

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";

// Counts are in trading days (NSE, ~252/year) since the series already
// excludes weekends — using calendar-day counts here would silently return
// ~30% fewer days than the label promises.
const RANGE_DAYS: Record<Exclude<ChartRange, "1D">, number> = {
  "1W": 5,
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
};

/** Daily bars for the given range (1D isn't served from here — the caller should use live intraday history for that). */
export function getDailyHistory(symbol: string, range: Exclude<ChartRange, "1D">): DailyBar[] {
  const series = getSeries(symbol);
  const days = RANGE_DAYS[range];
  return series.slice(-days);
}
