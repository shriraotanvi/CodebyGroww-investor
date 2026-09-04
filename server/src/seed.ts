import bcrypt from "bcryptjs";
import { query, queryOne, type UserRow } from "./db.js";
import { getQuote, getNiftyQuote, getSectorIndex } from "./marketData/engine.js";
import { SYMBOL_MAP } from "./symbols.js";

const DEMO_EMAIL = "demo@investor.app";
const DEMO_WATCHLIST = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "TATAMOTORS", "ADANIENT", "SUNPHARMA", "BHARTIARTL"];

// Synthetic offsets applied only to the demo user's baseline so the very
// first login already has a rich "what changed since you last checked"
// story instead of an empty diff. Real users get baseline = current quote
// on first view (nothing to compare yet).
const DEMO_OFFSETS: Record<string, number> = {
  RELIANCE: -0.038,
  TCS: -0.004,
  HDFCBANK: 0.012,
  INFY: -0.021,
  TATAMOTORS: 0.071,
  ADANIENT: -0.084,
  SUNPHARMA: 0.006,
  BHARTIARTL: -0.017,
};

export async function seedDemoUser(): Promise<UserRow> {
  let user = await queryOne<UserRow>("SELECT * FROM users WHERE email = $1", [DEMO_EMAIL]);

  if (!user) {
    const hash = bcrypt.hashSync("demo1234", 10);
    user = await queryOne<UserRow>(
      "INSERT INTO users (email, password_hash, display_name, created_at) VALUES ($1, $2, $3, $4) RETURNING *",
      [DEMO_EMAIL, hash, "Demo Investor", Date.now()]
    );
    const userId = user!.id;

    const now = Date.now();
    const lastCheckedAt = now - 1000 * 60 * 60 * 18;
    await query(
      "INSERT INTO sessions_meta (user_id, last_session_started_at, last_checkpoint_at) VALUES ($1, $2, $3)",
      [userId, lastCheckedAt, lastCheckedAt]
    );

    const nifty = getNiftyQuote();

    for (const symbol of DEMO_WATCHLIST) {
      await query(
        "INSERT INTO watchlist_items (user_id, symbol, added_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, symbol) DO NOTHING",
        [userId, symbol, now - 1000 * 60 * 60 * 24 * 3]
      );
      const quote = getQuote(symbol);
      const meta = SYMBOL_MAP.get(symbol);
      if (!quote || !meta) continue;
      const offset = DEMO_OFFSETS[symbol] ?? 0;
      const sectorIdx = getSectorIndex(meta.sector);
      await query(
        `INSERT INTO symbol_baselines
          (user_id, symbol, price, high52w, low52w, volume, avg_volume, nifty_price, sector_index_level, captured_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, symbol) DO UPDATE SET
           price=excluded.price, high52w=excluded.high52w, low52w=excluded.low52w,
           volume=excluded.volume, avg_volume=excluded.avg_volume,
           nifty_price=excluded.nifty_price, sector_index_level=excluded.sector_index_level,
           captured_at=excluded.captured_at`,
        [
          userId,
          symbol,
          Math.max(0.01, quote.price * (1 - offset)),
          quote.high52w,
          quote.low52w,
          quote.avgVolume * 0.4,
          quote.avgVolume,
          nifty ? nifty.price * (1 - offset * 0.15) : null,
          sectorIdx ? sectorIdx.level * (1 - offset * 0.4) : null,
          lastCheckedAt,
        ]
      );
    }
  }

  return user!;
}
