import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { getQuote, getNiftyQuote, getSectorIndex } from "../marketData/engine.js";
import { computeAttentionScore, ATTENTION_TIER_RANK, type BaselineSnapshot } from "../attentionScore.js";
import { getEventsSince } from "../events.js";
import { SYMBOL_MAP } from "../symbols.js";
import { getMarketStatus } from "../marketStatus.js";

export const watchlistRouter = Router();
watchlistRouter.use(requireAuth);

interface BaselineRow {
  symbol: string;
  price: number;
  high52w: number;
  low52w: number;
  volume: number;
  avg_volume: number;
  nifty_price: number | null;
  sector_index_level: number | null;
  captured_at: number;
}

async function getBaselines(userId: number): Promise<Map<string, BaselineSnapshot>> {
  const rows = await query<BaselineRow>("SELECT * FROM symbol_baselines WHERE user_id = $1", [userId]);
  const map = new Map<string, BaselineSnapshot>();
  for (const r of rows) {
    map.set(r.symbol, {
      price: r.price,
      high52w: r.high52w,
      low52w: r.low52w,
      volume: r.volume,
      avgVolume: r.avg_volume,
      niftyPrice: r.nifty_price,
      sectorIndexLevel: r.sector_index_level,
      capturedAt: Number(r.captured_at),
    });
  }
  return map;
}

async function getDampenMap(userId: number): Promise<Map<string, number>> {
  const rows = await query<{ symbol: string; dampen: number }>("SELECT symbol, dampen FROM symbol_prefs WHERE user_id = $1", [userId]);
  return new Map(rows.map((r) => [r.symbol, r.dampen]));
}

async function upsertBaseline(userId: number, symbol: string): Promise<void> {
  const quote = getQuote(symbol);
  const meta = SYMBOL_MAP.get(symbol);
  if (!quote || !meta) return;
  const nifty = getNiftyQuote();
  const sectorIdx = getSectorIndex(meta.sector);
  await query(
    `INSERT INTO symbol_baselines (user_id, symbol, price, high52w, low52w, volume, avg_volume, nifty_price, sector_index_level, captured_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, symbol) DO UPDATE SET
       price=excluded.price, high52w=excluded.high52w, low52w=excluded.low52w,
       volume=excluded.volume, avg_volume=excluded.avg_volume,
       nifty_price=excluded.nifty_price, sector_index_level=excluded.sector_index_level,
       captured_at=excluded.captured_at`,
    [
      userId,
      symbol,
      quote.price,
      quote.high52w,
      quote.low52w,
      quote.volume,
      quote.avgVolume,
      nifty?.price ?? null,
      sectorIdx?.level ?? null,
      Date.now(),
    ]
  );
}

// Full watchlist enriched with live quotes + attention score vs baseline.
// Does NOT advance the baseline on read — only an explicit /checkpoint call
// does that (see comment there), so "since you last checked" stays stable
// for the whole session instead of decaying on every poll.
watchlistRouter.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const items = await query<{ symbol: string; added_at: number }>(
      "SELECT symbol, added_at FROM watchlist_items WHERE user_id = $1 ORDER BY added_at ASC",
      [userId]
    );

    const [baselines, dampens] = await Promise.all([getBaselines(userId), getDampenMap(userId)]);
    const nifty = getNiftyQuote();

    const rows = await Promise.all(
      items.map(async ({ symbol, added_at }) => {
        const quote = getQuote(symbol);
        const meta = SYMBOL_MAP.get(symbol);
        if (!quote || !meta) {
          return { symbol, meta, addedAt: Number(added_at), quote: null, attention: null };
        }
        const baseline = baselines.get(symbol) ?? null;
        const sectorIdx = getSectorIndex(meta.sector);

        const niftyReturnSinceBaseline =
          baseline?.niftyPrice && nifty ? nifty.price / baseline.niftyPrice - 1 : null;
        const sectorReturnSinceBaseline =
          baseline?.sectorIndexLevel && sectorIdx ? sectorIdx.level / baseline.sectorIndexLevel - 1 : null;
        const eventsSinceBaseline = await getEventsSince(symbol, baseline?.capturedAt ?? Date.now() - 1000 * 60 * 60 * 24);

        const attention = computeAttentionScore({
          current: quote,
          baseline,
          niftyReturnSinceBaseline,
          sectorReturnSinceBaseline,
          eventsSinceBaseline,
          dampen: dampens.get(symbol) ?? 0,
        });
        return { symbol, meta, addedAt: Number(added_at), quote, attention };
      })
    );

    // Full sorted list, not just a top slice — the client is the one that
    // decides how much of it to actually show (the inbox caps hard by
    // default and lets the user explicitly ask for more).
    const changed = rows
      .filter((r) => r.attention && r.attention.tier !== "none")
      .sort((a, b) => ATTENTION_TIER_RANK[b.attention!.tier] - ATTENTION_TIER_RANK[a.attention!.tier] || b.attention!.score - a.attention!.score);

    const meta = await queryOne<{ last_session_started_at: number | null; last_checkpoint_at: number | null }>(
      "SELECT * FROM sessions_meta WHERE user_id = $1",
      [userId]
    );

    res.json({
      items: rows,
      summary: {
        totalTracked: rows.length,
        majorCount: changed.filter((r) => r.attention!.tier === "major").length,
        notableCount: changed.filter((r) => r.attention!.tier === "notable").length,
        minorCount: changed.filter((r) => r.attention!.tier === "minor").length,
        changes: changed.map((r) => ({ symbol: r.symbol, name: r.meta?.name, ...r.attention })),
      },
      lastCheckpointAt: meta?.last_checkpoint_at ? Number(meta.last_checkpoint_at) : null,
      marketStatus: getMarketStatus(),
    });
  } catch (err) {
    next(err);
  }
});

const symbolSchema = z.object({ symbol: z.string().min(1).max(20) });

watchlistRouter.post("/", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = symbolSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "symbol is required" });
    const symbol = parsed.data.symbol.toUpperCase();
    if (!SYMBOL_MAP.has(symbol)) return res.status(404).json({ error: `Unknown symbol: ${symbol}` });

    const userId = req.user!.userId;
    await query(
      "INSERT INTO watchlist_items (user_id, symbol, added_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, symbol) DO NOTHING",
      [userId, symbol, Date.now()]
    );
    // New additions start with a baseline of "now" — nothing to diff against
    // yet, so it won't falsely show up as a big mover.
    const existingBaseline = await queryOne("SELECT 1 FROM symbol_baselines WHERE user_id = $1 AND symbol = $2", [userId, symbol]);
    if (!existingBaseline) await upsertBaseline(userId, symbol);

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

watchlistRouter.delete("/:symbol", async (req: AuthedRequest, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const userId = req.user!.userId;
    await query("DELETE FROM watchlist_items WHERE user_id = $1 AND symbol = $2", [userId, symbol]);
    await query("DELETE FROM symbol_baselines WHERE user_id = $1 AND symbol = $2", [userId, symbol]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Advances the "last checked" baseline (price, 52w range, NIFTY level,
// sector level) to now for every watched symbol. Called once the client has
// rendered the attention digest, so the next session's diff starts fresh.
watchlistRouter.post("/checkpoint", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const items = await query<{ symbol: string }>("SELECT symbol FROM watchlist_items WHERE user_id = $1", [userId]);
    for (const { symbol } of items) await upsertBaseline(userId, symbol);

    const now = Date.now();
    await query(
      `INSERT INTO sessions_meta (user_id, last_session_started_at, last_checkpoint_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET last_checkpoint_at = excluded.last_checkpoint_at`,
      [userId, now, now]
    );

    res.json({ ok: true, checkpointedAt: now });
  } catch (err) {
    next(err);
  }
});

// Triage: "I've seen this, stop showing it until something new happens."
// Re-baselines just this one symbol (same mechanism as /checkpoint, scoped
// to one row) — it drops out of the inbox immediately and starts a fresh
// diff from right now, without touching anything else on the watchlist.
watchlistRouter.post("/:symbol/snooze", async (req: AuthedRequest, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const userId = req.user!.userId;
    const owns = await queryOne("SELECT 1 FROM watchlist_items WHERE user_id = $1 AND symbol = $2", [userId, symbol]);
    if (!owns) return res.status(404).json({ error: "Not on your watchlist" });
    await upsertBaseline(userId, symbol);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Triage: "this kind of alert isn't useful to me." Re-baselines the symbol
// (same immediate effect as snooze) AND permanently raises the bar for
// future alerts on it via the dampen counter — the product should visibly
// learn from this, not just mute the current card once.
watchlistRouter.post("/:symbol/not-interesting", async (req: AuthedRequest, res, next) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const userId = req.user!.userId;
    const owns = await queryOne("SELECT 1 FROM watchlist_items WHERE user_id = $1 AND symbol = $2", [userId, symbol]);
    if (!owns) return res.status(404).json({ error: "Not on your watchlist" });

    await query(
      `INSERT INTO symbol_prefs (user_id, symbol, dampen, updated_at) VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, symbol) DO UPDATE SET dampen = LEAST(symbol_prefs.dampen + 1, 5), updated_at = excluded.updated_at`,
      [userId, symbol, Date.now()]
    );
    await upsertBaseline(userId, symbol);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

watchlistRouter.post("/session-start", async (req: AuthedRequest, res, next) => {
  try {
    const userId = req.user!.userId;
    const now = Date.now();
    await query(
      `INSERT INTO sessions_meta (user_id, last_session_started_at, last_checkpoint_at) VALUES ($1, $2, NULL)
       ON CONFLICT (user_id) DO UPDATE SET last_session_started_at = excluded.last_session_started_at`,
      [userId, now]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
