# INVESTO₹ - an Indian investing platform with an attention layer

Every existing watchlist — Groww, Zerodha, Robinhood — shows you every stock you track with equal visual weight and makes *you* do the triage. INVESTO₹'s bet is that a watchlist's real job is to protect your limited attention, not display everything. It's built around one question, asked every time you open it: **"what actually deserves my attention right now?"**

## Quick start

Requires Node 22.5+ and a Postgres database (this project uses [Supabase](https://supabase.com)'s free tier — any Postgres works, since the schema and queries are plain portable SQL with no vendor-specific syntax).

1. Create a free Supabase project, then grab the connection string: dashboard → **Connect** (or Project Settings → Database) → **Connection string** → **URI**.
2. Create `server/.env` (copy `server/.env.example`) and set `DATABASE_URL` to that string.

```bash
# terminal 1 — backend (http://localhost:4000)
cd server
npm install
npm run dev   # creates the schema on first run if it doesn't exist yet

# terminal 2 — frontend (http://localhost:5173)
cd client
npm install
npm run dev
```

Open `http://localhost:5173` and click **"Try instant demo"** — no signup needed. It logs into a seeded account with an 8-stock NSE watchlist and ~18 hours of simulated history already behind it.

**To see the core feature live**, on the dashboard use the **"⏩ Simulate time passing"** control (+4h / +8h / +1 day / +3 days). It compresses that many hours of simulated market movement — price action, sector/NIFTY correlation, corporate events — into an instant call, without touching your "last checked" baseline. Dismiss the inbox ("Clear inbox"), hit "+8h", and watch it repopulate live with real, explainable reasoning. This is the fastest way to see what the product actually does without waiting for real time to pass.

## Product direction

The brief warns against building "the obvious watchlist." The obvious shape is a table of prices with a badge column bolted on — every existing app already does that, this one included, in its first draft. The version I believe should exist instead treats **attention as the scarce resource being allocated**, not price data:

1. **The home screen is an inbox, not a table.** Opening the app shows a capped, ranked list of things that crossed a meaningful bar since you last checked — not a spreadsheet of every stock with equal visual weight. The full list of everything you're tracking lives one tap away ("All stocks"), deliberately not the default.
2. **It's capped, not just color-coded.** The inbox shows the top 5 by default even if more crossed the threshold, and makes you explicitly ask for more ("Show N more"). Ruthlessness is the feature, not a limitation.
3. **It's triageable.** Every card can be "Snoozed" (re-baseline this one stock, stop showing it until it moves again) or marked "Not interesting" (permanently raises the bar for that stock's future alerts via a persistent per-user dampening factor). The product is meant to visibly get quieter about what you've told it doesn't matter, not repeat the same alert forever.
4. **The language is a notification, not a metric.** Cards read "Why we interrupted you," not "Attention Score: 82/100." The number still exists (transparency matters) but it's secondary to the plain-English reason.
5. **It's an Indian platform, not a US one wearing different branding.** NSE stocks, NIFTY 50, sector indices, INR formatting, IST market hours — and critically, the attention score is computed *relative to the Indian market's own structure* (a stock's move is judged against NIFTY and its own sector, not in isolation).

## Architecture

```
client/  React + TypeScript + Vite + Tailwind, polls the API every 5s
server/  Express + TypeScript, Postgres (Supabase) for persistence
           ├─ marketData/
           │    ├─ provider.ts       MarketDataProvider interface
           │    ├─ mockProvider.ts   factor-model simulator (see below) + time-travel
           │    └─ engine.ts         live quote cache, sector index calc, tick loop
           ├─ dailyHistory.ts        deterministic historical OHLC series (chart ranges, 52w calc)
           ├─ events.ts              synthetic corporate events/news, tied to price shocks
           ├─ attentionScore.ts      the "meaningful change" scoring + narrative engine
           ├─ marketStatus.ts        NSE session status (pre-open/open/closed/weekend, IST)
           ├─ routes/                auth, watchlist, market, stocks
           └─ db.ts                  schema (idempotent CREATE TABLE)
```

No message queue, no Redis, no separate microservice — a single Node process talking to a single hosted Postgres database. See [Scaling](#scaling-honestly) for what that claim is actually worth.

### The market simulation is a factor model, not independent random walks

Every symbol's price is driven by three layered components each tick: a shared **market factor** (drives NIFTY 50, scaled per-stock by beta), a **sector factor** (mean-reverting, lets a sector trend independently of the broad market for a while), and an **idiosyncratic** residual. This is what makes "outperformed NIFTY" and "outperformed its sector" real, computed signals instead of decoration — they're literally residuals against factors the engine generated, not something bolted on after the fact.

Sector index levels are computed on demand from live constituent prices (equal-weighted, rebased to 1000), not simulated separately, so they're always internally consistent with the stocks driving them. 52-week high/low ranges are derived from an actual generated daily history (`dailyHistory.ts`), not an independent random guess, so "new 52-week high" is consistent with what the chart shows.

### Data flow

1. A background loop ticks every 4s, advancing the factor model for ~25 NSE stocks + NIFTY 50, and keeping a rolling intraday history per symbol (chart + staleness detection).
2. `GET /api/watchlist` joins a user's watched symbols against that live state, diffs each one against the user's stored baseline (price, 52w range, NIFTY level, sector level — all captured at the same instant), and returns the full sorted list of changes plus a live quote for every symbol.
3. The frontend polls that endpoint every 5s for live price movement, but the **baseline only advances on an explicit action**: dismissing the inbox, snoozing/dismissing an individual stock, or automatically when the tab is hidden/closed (`visibilitychange` / `beforeunload`, via `fetch(..., {keepalive: true})`). This is what makes "since you last checked" mean something stable for a whole session instead of re-diffing against itself every 5 seconds.

## Meaningful-change detection: the attention score

`server/src/attentionScore.ts` computes a 0–100 score built from independent, individually-gated signals — a sum of evidence, not a single opaque number:

| Signal | Weight | Why it's there |
|---|---|---|
| Price magnitude | up to 55 pts | Scaled by the stock's own volatility — a 1.5% move in a sleepy FMCG name scores higher than the same move in a high-beta name like ADANIENT. A flat % threshold either spams alerts on volatile stocks or misses real moves on quiet ones. |
| Relative volume | up to 18 pts | Current volume vs. average, only counted alongside a real price move — volume on its own isn't a signal, volume *behind* a move is conviction. |
| Realized volatility spike | up to 10 pts | Short-term price variance vs. the stock's expected variance — "trading more erratically than usual" is a distinct signal from raw magnitude. |
| vs. NIFTY 50 | up to 15 pts | Outperformance/underperformance since baseline — computed as a literal residual against the shared market factor, not estimated. |
| vs. sector | up to 15 pts | Same idea, against the sector index. |
| 52-week crossing | 20 pts flat | Structurally significant regardless of the percentage move. |
| Corporate event | up to 25 pts | Synthetic earnings/guidance/rating/regulatory events (`events.ts`), generated in sync with simulated price shocks so a big move always has a matching headline. |

Two correctness bugs were caught during manual testing and are worth naming, because they're the kind of thing that erodes trust in an "explainable" system if missed:

- **A signal firing with a misleading 0.00% badge.** Early versions let a trend-reversal or a corporate event alone assign a tier even when the net price move was effectively zero — producing nonsensical cards like "Minor +0.00%." Fixed by requiring a real price move or a 52-week crossing before *any* tier above "none" fires; a lone event still contributes to the score/reasons, it just can't carry a tier by itself.
- **A narrative that contradicted its own data.** A stock can beat earnings and still close down if the broader market sells off harder — the naive template produced "TCS down 3% following positive news: beats earnings," which reads as a bug. Fixed by detecting when the event's sentiment and the net price direction disagree, and phrasing it as a contrast ("moved X% *despite* positive news — broader market forces look like they're dominating here") instead of implying causation that isn't there.

A third bug, in the time-travel simulator, is worth naming for the same reason: the drift-decay math that makes a "shock" (a simulated news event) fade out over time was calibrated for real 4-second ticks. Applied at the coarser step size used to fast-forward hours instantly, it over-applied each shock by roughly 10x, producing absurd -40% moves. Fixed with a discretization-invariant exponential-decay model (a fixed half-life in minutes) shared by both the real-time and fast-forwarded code paths, so the same math is correct at any step size.

## Triage and personalization

Every attention card can be:
- **Snoozed** — re-baselines that one stock immediately (same mechanism as the global checkpoint, scoped to one symbol). It disappears from the inbox and starts a fresh diff from now.
- **Marked "not interesting"** — does the same, plus increments a persistent per-`(user, symbol)` dampening counter (`symbol_prefs` table). Each dampening step divides that stock's future score by `(1 + dampen × 0.35)`, so a symbol you've repeatedly dismissed needs a proportionally bigger move to earn its way back into the inbox. This is what makes triage feel like the product is learning, not just muting the current alert once.

## Persistence & cross-device state

Watchlists, baselines, triage preferences, and session checkpoints are all keyed by **user account** (Postgres tables: `users`, `watchlist_items`, `symbol_baselines`, `symbol_prefs`, `sessions_meta`), not by browser or device. Signing in anywhere reconstructs the same watchlist and the same "since you last checked" state, because none of it lives in `localStorage` — the client only caches the JWT and a display copy of the user object there. I haven't physically tested two devices side by side, but the architecture doesn't have a path for it to fail: every read and write goes through the account-scoped API, there's no device-local source of truth to diverge.

## Handling stale, delayed, and conflicting data — honestly

This is the section I'd push back on if I were reviewing this myself, so here's the real state, not the aspirational one:

**Stale data (implemented, narrow):** every quote carries `ageMs` and an `isStale` flag (no update in >20s — several missed ticks), surfaced as a small indicator next to the price. Market session status (pre-open/open/closed/weekend, computed from real IST time) is shown on the stock detail page, so a quote outside trading hours reads as "last known," not "live." That's the extent of it — there's no distinct "delayed vs. stale" state, and no explicit UI for "this data is N minutes old and that's expected right now."

**Conflicting data (designed, not demonstrated):** `marketData/provider.ts` defines a `MarketDataProvider` interface specifically so a real vendor feed could run alongside the simulator with a fallback path. But only one provider (`MockProvider`) is actually running — there's no free, keyless NSE data API to wire in as a genuine second source, so I never built the actual disagreement-and-reconciliation path. If asked to show it live, I have the interface and the intended fallback design, not a demo of two sources actually disagreeing.

**Scaling (documented, not load-tested):** the market simulation runs once, shared across all users, not once per user — that part is real and verifiable by reading `engine.ts`. Persistence already runs on hosted Postgres (Supabase), which is real infrastructure, not a documented aspiration — but the rest of the scaling story (polling → SSE/WebSocket as the first thing to change if concurrent-user traffic got expensive, a caching layer in front of a real vendor API, connection pooling tuning under real concurrent load) is a considered argument about what would change and why, not something I've run a load test against. I'd rather say that plainly than imply it's been verified.

## Scaling, honestly

| Concern | What's actually true today | What would change first |
|---|---|---|
| Market data computation | One shared in-memory tick loop for ~25 symbols, independent of user count — verified by reading the code, not load-tested | Move the tick loop to its own process publishing to Redis/Kafka once a single Node process's compute becomes the bottleneck |
| Watchlist reads | Polling `GET /api/watchlist` every 5s per client; the per-request join (symbols × baseline diff) is O(watchlist size) | Push-based updates (SSE/WebSocket) once concurrent-user polling traffic is the dominant cost, not the query itself |
| Persistence | Hosted Postgres (Supabase), parameterized SQL, a single connection pool | Add read replicas / a pgbouncer-style pooler in front for high concurrent connection counts; the app already speaks plain Postgres so this is an infra change, not an app change |
| Real market data | N/A — simulator only | A shared short-TTL cache in front of a real vendor call, so N users watching RELIANCE costs one upstream call, not N |
| Auth | Stateless JWT, no session store | Already horizontally scalable as-is |

## Key tradeoffs

- **Simulated data by default.** Real NSE data isn't free/keyless the way some US equity APIs are, and building the demo against a paid or rate-limited API would make it fragile to present. The `MarketDataProvider` interface exists so a real vendor is a drop-in later, not a rewrite — see the honest caveat above about that path being designed, not demonstrated.
- **Polling over WebSockets.** A 5s poll is simple, stateless, and trivially scalable; prices don't need sub-second delivery for a watchlist. Called out above as the first thing to reconsider if usage patterns changed.
- **Hosted Postgres (Supabase) over an embedded file DB.** The app briefly ran on Node's built-in `node:sqlite` (zero native build step, zero setup) during early development, but a real deployment needs persistence that survives the process restarting on ephemeral hosting — so it moved to a real hosted database. The schema was already portable SQL with no SQLite-specific syntax, so this was a driver swap (`pg` + async/await everywhere), not a rewrite of the data model.
- **Checkpoint-on-leave, not checkpoint-on-every-poll.** If the baseline advanced on every 5s poll, "since you last checked" would only ever show the last 5 seconds of movement. Advancing it only on dismiss/snooze/tab-hide is what makes a session's worth of change visible in one place — this was the one genuinely non-obvious modeling decision in the whole project.
- **A capped, triageable inbox over an exhaustive table.** The most deliberate product decision here: showing everything with a badge is still "the obvious watchlist," just with more columns. Forcing a cap and adding triage is what makes the product's thesis ("protect your attention") real instead of aspirational copy.

## What I'd add next

- An actual second data source (even a second synthetic one, deliberately jittered/delayed) to build and demonstrate real conflict-reconciliation logic instead of just the interface for it.
- A basic load test (seed N users × M-stock watchlists, measure `GET /watchlist` latency) to turn the scaling section from an argument into a number.
- A distinct "delayed" state separate from "stale," with an explicit reason shown to the user (market closed vs. feed lag vs. never fetched).
- Push notification / email digest for major-tier changes while away — the checkpoint model already has the right data shape for this, it's a delivery mechanism away.
- Portfolio-level insight across the whole watchlist (e.g., sector concentration, correlation to NIFTY) rather than only per-stock.
