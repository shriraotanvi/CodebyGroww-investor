import { Router } from "express";
import { z } from "zod";
import { SYMBOL_UNIVERSE, SECTORS } from "../symbols.js";
import { getEngineHealth, listAllSymbolsWithQuotes, getNiftyQuote, getAllSectorIndices, fastForwardHours, resetSimulation } from "../marketData/engine.js";
import { getMarketStatus } from "../marketStatus.js";
import { requireAuth } from "../auth.js";

export const marketRouter = Router();

// Lightweight directory for search — separate from the authed watchlist
// routes since browsing the universe doesn't require login. Supports the
// DISCOVER -> SEARCH step of the platform journey.
marketRouter.get("/symbols", (req, res) => {
  const q = (req.query.q as string | undefined)?.toLowerCase().trim();
  const sector = req.query.sector as string | undefined;
  const results = SYMBOL_UNIVERSE.filter((s) => {
    const matchesQuery = !q || s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    const matchesSector = !sector || s.sector === sector;
    return matchesQuery && matchesSector;
  }).slice(0, 25);
  res.json({ results });
});

marketRouter.get("/movers", (_req, res) => {
  const quotes = listAllSymbolsWithQuotes();
  const withPct = quotes.map((q) => ({
    symbol: q.symbol,
    price: q.price,
    pctChange: q.prevClose > 0 ? (q.price - q.prevClose) / q.prevClose : 0,
  }));
  const gainers = [...withPct].sort((a, b) => b.pctChange - a.pctChange).slice(0, 5);
  const losers = [...withPct].sort((a, b) => a.pctChange - b.pctChange).slice(0, 5);
  res.json({ gainers, losers });
});

// Market home: index level, sector performance, market session status, and
// top movers — the "market overview" surface of the platform.
marketRouter.get("/overview", (_req, res) => {
  const nifty = getNiftyQuote();
  const sectorIndices = getAllSectorIndices();
  const sectors = SECTORS.map((sector) => ({ sector, ...sectorIndices[sector] })).filter((s) => s.level !== undefined);

  const quotes = listAllSymbolsWithQuotes();
  const withPct = quotes.map((q) => ({
    symbol: q.symbol,
    price: q.price,
    pctChange: q.prevClose > 0 ? (q.price - q.prevClose) / q.prevClose : 0,
  }));
  const gainers = [...withPct].sort((a, b) => b.pctChange - a.pctChange).slice(0, 5);
  const losers = [...withPct].sort((a, b) => a.pctChange - b.pctChange).slice(0, 5);

  res.json({
    nifty: nifty
      ? {
          symbol: nifty.symbol,
          price: nifty.price,
          pctChange: nifty.prevClose > 0 ? nifty.price / nifty.prevClose - 1 : 0,
          history: nifty.history,
        }
      : null,
    sectors: sectors.sort((a, b) => b.pctChange - a.pctChange),
    gainers,
    losers,
    marketStatus: getMarketStatus(),
  });
});

marketRouter.get("/sectors/:sector", (req, res) => {
  const sector = req.params.sector as (typeof SECTORS)[number];
  if (!SECTORS.includes(sector)) return res.status(404).json({ error: "Unknown sector" });
  const members = SYMBOL_UNIVERSE.filter((s) => s.sector === sector).map((s) => {
    const q = listAllSymbolsWithQuotes().find((quote) => quote.symbol === s.symbol);
    return q
      ? { symbol: s.symbol, name: s.name, price: q.price, pctChange: q.prevClose > 0 ? q.price / q.prevClose - 1 : 0 }
      : null;
  }).filter(Boolean);
  const idx = getAllSectorIndices()[sector];
  res.json({ sector, index: idx ?? null, members });
});

marketRouter.get("/health", (_req, res) => {
  res.json(getEngineHealth());
});

const simulateTimeSchema = z.object({ hours: z.number().positive().max(24 * 30) });

// Time-travel demo control: compresses N hours of simulated market movement
// (price action + corporate events) into an instant call, without touching
// any user's "last checked" baseline. This is what makes the "what changed
// while you were away" experience demonstrable live instead of requiring an
// actual multi-hour wait. Affects the shared market for all users — that's
// an acceptable tradeoff for a demo control, not something a production
// per-user feature would do.
marketRouter.post("/simulate-time", requireAuth, async (req, res) => {
  const parsed = simulateTimeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "hours must be a positive number (max 720)" });
  const result = await fastForwardHours(parsed.data.hours);
  res.json({ ok: true, ...result });
});

// Undoes every simulated fast-forward back to the server-boot snapshot, so
// trying "+4h" and then wanting to instead see "+8h" means resetting to a
// known baseline rather than the two runs stacking into an inaccurate 12h.
marketRouter.post("/reset-simulation", requireAuth, async (_req, res) => {
  await resetSimulation();
  res.json({ ok: true });
});
