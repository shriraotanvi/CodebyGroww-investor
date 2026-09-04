import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

// Hosted Postgres (Supabase) — swapped in from the original embedded
// node:sqlite file. The schema below is unchanged in shape from the SQLite
// version; only the dialect specifics (AUTOINCREMENT -> SERIAL, etc.) and
// the driver (synchronous node:sqlite calls -> async pg queries) changed.
// Every route that touches the DB is async now as a result.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Create server/.env with DATABASE_URL=<your Supabase Postgres connection string> (Project Settings -> Database -> Connection string in the Supabase dashboard)."
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase's pooler requires TLS; hosted DBs generally use a cert not in Node's default trust store for this kind of managed Postgres
});

/** Thin query helper — every call site awaits this instead of the old synchronous better-sqlite3-style API. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/** Convenience for a single-row lookup — returns undefined instead of an empty array when nothing matches. */
export async function queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

// Persistence model:
// - users / watchlist_items give every user a durable, cross-device
//   watchlist (identified by account, not by browser/device).
// - symbol_baselines is the "what have you already seen" checkpoint per
//   (user, symbol): the price/volume/52w state captured at the *start* of
//   their last session. Meaningful-change detection diffs live quotes
//   against this row, then the row is advanced once the change has been
//   shown, so the next visit diffs against a fresh baseline.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    added_at BIGINT NOT NULL,
    UNIQUE(user_id, symbol)
  );
  CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items(user_id);

  CREATE TABLE IF NOT EXISTS symbol_baselines (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    price DOUBLE PRECISION NOT NULL,
    high52w DOUBLE PRECISION NOT NULL,
    low52w DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION NOT NULL,
    avg_volume DOUBLE PRECISION NOT NULL,
    nifty_price DOUBLE PRECISION,
    sector_index_level DOUBLE PRECISION,
    captured_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS sessions_meta (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_session_started_at BIGINT,
    last_checkpoint_at BIGINT
  );

  -- Per-(user, symbol) triage state. "dampen" is how many times the user
  -- has said "not interesting" about this symbol — each one raises the bar
  -- for what counts as attention-worthy going forward (see
  -- attentionScore.ts), so the product visibly gets quieter about things
  -- you've told it not to bother you with, instead of re-showing the same
  -- kind of signal forever.
  CREATE TABLE IF NOT EXISTS symbol_prefs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    dampen INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, symbol)
  );

  -- Synthetic corporate events / news headlines. A real system would source
  -- these from an exchange corporate-actions feed and a news API; here
  -- they're generated (see events.ts) either at seed time or in sync with a
  -- simulated price shock, so "why did this move" always has an answer.
  CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL,
    headline TEXT NOT NULL,
    detail TEXT NOT NULL,
    sentiment TEXT NOT NULL,
    importance DOUBLE PRECISION NOT NULL,
    occurred_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_symbol_time ON events(symbol, occurred_at DESC);
`;

export async function initDb(): Promise<void> {
  await pool.query(SCHEMA);
}

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: number;
}
