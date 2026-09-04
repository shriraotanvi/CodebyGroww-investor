import { Router } from "express";
import { queryOne } from "../db.js";
import { optionalAuth, type AuthedRequest } from "../auth.js";
import { getQuote, getNiftyQuote, getSectorIndex } from "../marketData/engine.js";
import { SYMBOL_MAP, sectorSymbols } from "../symbols.js";
import { getEventsForSymbol, getEventsSince } from "../events.js";
import { computeAttentionScore, type BaselineSnapshot } from "../attentionScore.js";
import { getMarketStatus } from "../marketStatus.js";
import { getDailyHistory, type ChartRange } from "../dailyHistory.js";

export const stocksRouter = Router();

interface BaselineRow {
  price: number;
  high52w: number;
  low52w: number;
  volume: number;
  avg_volume: number;
  nifty_price: number | null;
  sector_index_level: number | null;
  captured_at: number;
}

// The VIEW STOCK -> ANALYZE step of the journey. Public (no login required)
// so a user can research before ever creating a watchlist, but personalizes
// with an attention score if they're signed in and already watching it.
stocksRouter.get("/:symbol", optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const meta = SYMBOL_MAP.get(symbol);
    if (!meta) return res.status(404).json({ error: `Unknown symbol: ${symbol}` });

    const quote = getQuote(symbol);
    if (!quote) return res.status(503).json({ error: "Market data not ready yet — try again in a moment" });

    const nifty = getNiftyQuote();
    const sectorIdx = getSectorIndex(meta.sector);
    const peers = sectorSymbols(meta.sector)
      .filter((s) => s.symbol !== symbol)
      .slice(0, 5)
      .map((s) => {
        const q = getQuote(s.symbol);
        return q ? { symbol: s.symbol, name: s.name, price: q.price, pctChange: q.prevClose > 0 ? q.price / q.prevClose - 1 : 0 } : null;
      })
      .filter(Boolean);

    const dayPctChange = quote.prevClose > 0 ? quote.price / quote.prevClose - 1 : 0;
    const niftyDayPctChange = nifty && nifty.prevClose > 0 ? nifty.price / nifty.prevClose - 1 : 0;
    const sectorDayPctChange = sectorIdx?.pctChange ?? 0;

    const events = await getEventsForSymbol(symbol, 8);

    let attention = null;
    let isWatching = false;
    if (req.user) {
      const userId = req.user.userId;
      isWatching = !!(await queryOne("SELECT 1 FROM watchlist_items WHERE user_id = $1 AND symbol = $2", [userId, symbol]));
      if (isWatching) {
        const baselineRow = await queryOne<BaselineRow>(
          "SELECT * FROM symbol_baselines WHERE user_id = $1 AND symbol = $2",
          [userId, symbol]
        );
        const baseline: BaselineSnapshot | null = baselineRow
          ? {
              price: baselineRow.price,
              high52w: baselineRow.high52w,
              low52w: baselineRow.low52w,
              volume: baselineRow.volume,
              avgVolume: baselineRow.avg_volume,
              niftyPrice: baselineRow.nifty_price,
              sectorIndexLevel: baselineRow.sector_index_level,
              capturedAt: Number(baselineRow.captured_at),
            }
          : null;
        const niftyReturnSinceBaseline = baseline?.niftyPrice && nifty ? nifty.price / baseline.niftyPrice - 1 : null;
        const sectorReturnSinceBaseline =
          baseline?.sectorIndexLevel && sectorIdx ? sectorIdx.level / baseline.sectorIndexLevel - 1 : null;
        const eventsSinceBaseline = await getEventsSince(symbol, baseline?.capturedAt ?? Date.now() - 1000 * 60 * 60 * 24);
        const dampenRow = await queryOne<{ dampen: number }>(
          "SELECT dampen FROM symbol_prefs WHERE user_id = $1 AND symbol = $2",
          [userId, symbol]
        );
        attention = computeAttentionScore({
          current: quote,
          baseline,
          niftyReturnSinceBaseline,
          sectorReturnSinceBaseline,
          eventsSinceBaseline,
          dampen: dampenRow?.dampen ?? 0,
        });
      }
    }

    res.json({
      meta,
      quote,
      dayPctChange,
      context: {
        niftyDayPctChange,
        sectorDayPctChange,
        sector: meta.sector,
        sectorIndexLevel: sectorIdx?.level ?? null,
      },
      peers,
      events,
      isWatching,
      attention,
      marketStatus: getMarketStatus(),
    });
  } catch (err) {
    next(err);
  }
});

stocksRouter.get("/:symbol/events", async (req, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    if (!SYMBOL_MAP.has(symbol)) return res.status(404).json({ error: `Unknown symbol: ${symbol}` });
    res.json({ events: await getEventsForSymbol(symbol, 30) });
  } catch (err) {
    next(err);
  }
});

const VALID_RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "6M", "1Y"];

// Chart data for a given range. 1D is served from the live intraday tick
// buffer (via the quote itself); everything longer comes from the daily
// historical-snapshot series (dailyHistory.ts) — a real vendor would swap
// in for that series without this endpoint's shape changing.
stocksRouter.get("/:symbol/history", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!SYMBOL_MAP.has(symbol)) return res.status(404).json({ error: `Unknown symbol: ${symbol}` });
  const range = (req.query.range as ChartRange) || "1M";
  if (!VALID_RANGES.includes(range)) return res.status(400).json({ error: `range must be one of ${VALID_RANGES.join(", ")}` });

  if (range === "1D") {
    const quote = getQuote(symbol);
    return res.json({ range, bars: quote ? quote.history.map((price) => ({ price })) : [] });
  }
  res.json({ range, bars: getDailyHistory(symbol, range) });
});
