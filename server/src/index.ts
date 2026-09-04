import express from "express";
import cors from "cors";
import { initDb } from "./db.js";
import { startMarketEngine } from "./marketData/engine.js";
import { seedHistoricalEvents } from "./events.js";
import { authRouter } from "./routes/auth.js";
import { watchlistRouter } from "./routes/watchlist.js";
import { marketRouter } from "./routes/market.js";
import { stocksRouter } from "./routes/stocks.js";

async function main() {
  // Schema must exist before anything touches the DB (seeding, requests).
  await initDb();

  const app = express();
  app.use(cors());
  app.use(express.json());

  startMarketEngine();
  // Give the engine one tick to populate quotes before seeding events/demo
  // data that reads from it (both read live quotes at seed time).
  setTimeout(() => {
    seedHistoricalEvents().catch((err) => console.error("Failed to seed historical events:", err));
  }, 250);

  app.get("/api/health", async (_req, res) => {
    // A real health check, not just "the process is up" — actually probes
    // the DB connection so a Supabase/network hiccup is visibly distinct
    // from a generic 500 instead of every endpoint failing the same way.
    try {
      const { pool } = await import("./db.js");
      await pool.query("SELECT 1");
      res.json({ ok: true, db: "connected" });
    } catch (err) {
      res.status(503).json({ ok: false, db: "unreachable", error: err instanceof Error ? err.message : "unknown error" });
    }
  });
  app.use("/api/auth", authRouter);
  app.use("/api/watchlist", watchlistRouter);
  app.use("/api/market", marketRouter);
  app.use("/api/stocks", stocksRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  const PORT = Number(process.env.PORT) || 4000;
  app.listen(PORT, () => {
    console.log(`INVESTO₹ API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
