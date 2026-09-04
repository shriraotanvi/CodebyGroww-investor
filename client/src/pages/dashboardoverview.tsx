import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MarketOverview as MarketOverviewData, type WatchlistResponse } from "../lib/api";
import { formatPct, formatPrice } from "../lib/format";
import AppShell from "../components/AppShell";
import Sparkline from "../components/Sparkline";
import TierBadge from "../components/TierBadge";

// A stat-tile "at a glance" landing page — distinct from the Inbox (which
// is deliberately narrow and triage-focused) and from Market (which is the
// full NSE picture). This is the wide-angle view: your watchlist's health,
// the index, and sector performance in one screen. Reuses the same two
// endpoints every other page already calls — no new backend surface.
export default function DashboardOverview() {
  const [overview, setOverview] = useState<MarketOverviewData | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistResponse | null>(null);

  useEffect(() => {
    const load = () => {
      api.overview().then(setOverview).catch(() => {});
      api.getWatchlist().then(setWatchlist).catch(() => {});
    };
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  const majorCount = watchlist?.summary.majorCount ?? 0;
  const notableCount = watchlist?.summary.notableCount ?? 0;
  const minorCount = watchlist?.summary.minorCount ?? 0;
  const tracked = watchlist?.summary.totalTracked ?? 0;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your watchlist and the market, at a glance.</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Tracked stocks" value={String(tracked)} />
          <StatTile label="Major alerts" value={String(majorCount)} accent={majorCount > 0 ? "violet" : undefined} />
          <StatTile label="Notable alerts" value={String(notableCount)} accent={notableCount > 0 ? "amber" : undefined} />
          <StatTile
            label="NIFTY 50 today"
            value={overview ? formatPct(overview.nifty?.pctChange ?? 0) : "—"}
            accent={overview && (overview.nifty?.pctChange ?? 0) >= 0 ? "up" : "down"}
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="border border-surface-border rounded-2xl shadow-card p-5 bg-surface-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-800">NIFTY 50</h2>
                {overview?.nifty && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold tabular-nums">{formatPrice(overview.nifty.price)}</span>
                    <span className={`text-xs font-semibold tabular-nums ${overview.nifty.pctChange >= 0 ? "text-up" : "text-down"}`}>
                      {formatPct(overview.nifty.pctChange)}
                    </span>
                  </div>
                )}
              </div>
              {overview?.nifty ? (
                <Sparkline data={overview.nifty.history} positive={overview.nifty.pctChange >= 0} width={600} height={90} />
              ) : (
                <div className="h-[90px] animate-pulse bg-surface-raised rounded-lg" />
              )}
            </div>

            <div className="border border-surface-border rounded-2xl shadow-card p-5 bg-surface-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-800">Sector performance</h2>
                <Link to="/market" className="text-xs text-accent hover:underline">
                  View market →
                </Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {overview?.sectors.map((s) => (
                  <Link
                    key={s.sector}
                    to={`/sector/${encodeURIComponent(s.sector)}`}
                    className="border border-surface-border rounded-lg px-3 py-2 hover:border-accent/50 transition"
                  >
                    <div className="text-xs font-medium text-slate-700 truncate">{s.sector}</div>
                    <div className={`text-xs font-mono tabular-nums ${s.pctChange >= 0 ? "text-up" : "text-down"}`}>
                      {formatPct(s.pctChange)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="border border-surface-border rounded-2xl shadow-card p-5 bg-surface-card h-fit">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800">My watchlist</h2>
              <Link to="/" className="text-xs text-accent hover:underline">
                Open inbox →
              </Link>
            </div>
            {!watchlist || watchlist.items.length === 0 ? (
              <p className="text-sm text-slate-500">
                {watchlist ? "Nothing on your watchlist yet." : "Loading…"}
              </p>
            ) : (
              <div className="space-y-1">
                {watchlist.items.map((item) => {
                  if (!item.quote) return null;
                  const dayPct = item.quote.prevClose > 0 ? (item.quote.price - item.quote.prevClose) / item.quote.prevClose : 0;
                  return (
                    <Link
                      key={item.symbol}
                      to={`/stock/${item.symbol}`}
                      className="flex items-center justify-between py-2 border-b border-surface-border last:border-0 hover:bg-surface-raised -mx-2 px-2 rounded-lg transition"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm font-semibold">{item.symbol}</span>
                          {item.attention && item.attention.tier !== "none" && <TierBadge tier={item.attention.tier} />}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{item.meta?.name}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-mono tabular-nums">{formatPrice(item.quote.price)}</p>
                        <p className={`text-xs font-mono tabular-nums ${dayPct >= 0 ? "text-up" : "text-down"}`}>{formatPct(dayPct)}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: "violet" | "amber" | "up" | "down" }) {
  const color =
    accent === "violet" ? "text-violet-600" : accent === "amber" ? "text-amber-600" : accent === "up" ? "text-up" : accent === "down" ? "text-down" : "text-slate-900";
  return (
    <div className="border border-surface-border rounded-2xl shadow-card px-4 py-3.5 bg-surface-card">
      <p className="text-[11px] text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
