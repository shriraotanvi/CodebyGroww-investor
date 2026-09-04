import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type ChartRange, type StockDetail as StockDetailData } from "../lib/api";
import { formatMarketCap, formatPct, formatPrice, formatVolume } from "../lib/format";
import Sparkline from "../components/Sparkline";
import TierBadge from "../components/TierBadge";
import AppShell from "../components/AppShell";
import { useAuth } from "../context/AuthContext";

const RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "6M", "1Y"];

export default function StockDetail() {
  const { symbol = "" } = useParams();
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<StockDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<ChartRange>("1D");
  const [chartSeries, setChartSeries] = useState<number[] | null>(null);

  const refresh = useCallback(() => {
    api
      .stockDetail(symbol)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load stock"));
  }, [symbol]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (range === "1D") {
      setChartSeries(null); // fall back to live quote.history
      return;
    }
    let cancelled = false;
    api.stockHistory(symbol, range).then((res) => {
      if (cancelled) return;
      setChartSeries(res.bars.map((b) => b.close ?? b.price ?? 0));
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  async function toggleWatch() {
    if (!data) return;
    setBusy(true);
    try {
      if (data.isWatching) await api.removeSymbol(symbol);
      else await api.addSymbol(symbol);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleSnooze() {
    await api.snoozeSymbol(symbol).catch(() => {});
    refresh();
  }

  async function handleNotInteresting() {
    await api.notInteresting(symbol).catch(() => {});
    refresh();
  }

  if (error && !data) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <div className="border border-down/30 bg-down/5 rounded-2xl px-5 py-6 text-center text-sm text-down">{error}</div>
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <div className="h-40 bg-surface-card border border-surface-border rounded-2xl shadow-card animate-pulse" />
        </div>
      </AppShell>
    );
  }

  const { meta, quote, dayPctChange, context, peers, events, isWatching, attention, marketStatus } = data;
  const range52wPct = quote.high52w > quote.low52w ? (quote.price - quote.low52w) / (quote.high52w - quote.low52w) : 0.5;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-mono">{meta.symbol}</h1>
            <span className="text-[10px] uppercase text-slate-500 border border-surface-border rounded px-1.5 py-0.5">
              {meta.sector}
            </span>
            {!marketStatus.isOpen && (
              <span className="text-[10px] text-amber-700 border border-amber-200 bg-amber-50 rounded px-1.5 py-0.5">
                Market closed — {marketStatus.nextTransition}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">{meta.name}</p>
        </div>
        {isAuthenticated && (
          <button
            onClick={toggleWatch}
            disabled={busy}
            className={`text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50 ${
              isWatching ? "border border-surface-border text-slate-700 hover:border-down/50 hover:text-down" : "bg-accent hover:bg-indigo-500 text-white"
            }`}
          >
            {isWatching ? "− Remove from watchlist" : "+ Add to watchlist"}
          </button>
        )}
      </div>

      <div className="flex items-end gap-4">
        <span className="text-3xl font-bold font-mono tabular-nums">{formatPrice(quote.price)}</span>
        <span className={`text-lg font-mono tabular-nums ${dayPctChange >= 0 ? "text-up" : "text-down"}`}>
          {formatPct(dayPctChange)} today
        </span>
      </div>

      <div className="border border-surface-border rounded-2xl shadow-card p-4 bg-surface-card">
        <div className="flex gap-1 mb-3">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`text-xs px-2.5 py-1 rounded-md transition ${
                range === r ? "bg-accent text-white" : "text-slate-600 hover:text-slate-800 hover:bg-surface-raised"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        {(() => {
          const activeSeries = range === "1D" ? quote.history : chartSeries;
          if (!activeSeries || activeSeries.length < 2) {
            return <div className="h-[120px] flex items-center justify-center text-xs text-slate-500">Loading chart…</div>;
          }
          const seriesPositive = activeSeries[activeSeries.length - 1] >= activeSeries[0];
          return <Sparkline data={activeSeries} positive={seriesPositive} width={600} height={120} />;
        })()}
      </div>

      {/* The differentiator — framed as "why we interrupted you," not a
          dashboard metric, and triage-able so the product visibly learns
          what you don't want re-surfaced. Shown only when watching. */}
      {isWatching && attention && attention.tier !== "none" && (
        <div className="border border-accent/25 bg-gradient-to-b from-accent/[0.07] to-transparent rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Why we interrupted you</h2>
            <div className="flex items-center gap-2">
              <TierBadge tier={attention.tier} />
              <span key={attention.score} className="animate-score-in inline-block text-lg font-bold tabular-nums text-slate-700">
                {attention.score}
              </span>
              <span className="text-[11px] text-slate-400">/100</span>
            </div>
          </div>
          <p className="text-sm text-slate-700 mb-3">{attention.whyItMatters}</p>
          {attention.signals.length > 0 && (
            <ul className="space-y-1 mb-4">
              {attention.signals.map((s) => (
                <li key={s.key} className="text-xs text-slate-600 flex items-center justify-between">
                  <span>• {s.label}</span>
                  <span className="text-slate-500 tabular-nums">+{s.points}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 pt-3 border-t border-surface-border/60">
            <button
              onClick={handleSnooze}
              className="text-xs px-2.5 py-1.5 rounded-md border border-surface-border text-slate-600 hover:text-slate-800 hover:border-slate-400"
            >
              Snooze — seen it
            </button>
            <button
              onClick={handleNotInteresting}
              className="text-xs px-2.5 py-1.5 rounded-md border border-surface-border text-slate-600 hover:text-down hover:border-down/40"
            >
              Not interesting
            </button>
          </div>
        </div>
      )}
      {isWatching && attention && attention.tier === "none" && (
        <div className="border border-surface-border rounded-2xl shadow-card p-4 text-sm text-slate-500">
          Quiet since your last visit — nothing here needs your attention right now.
        </div>
      )}

      {/* Context: vs NIFTY / vs sector, always shown regardless of watch status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="vs NIFTY 50 today" value={formatPct(dayPctChange - context.niftyDayPctChange)} positive={dayPctChange >= context.niftyDayPctChange} />
        <StatBox label={`vs ${meta.sector} today`} value={formatPct(dayPctChange - context.sectorDayPctChange)} positive={dayPctChange >= context.sectorDayPctChange} />
        <StatBox label="Volume" value={formatVolume(quote.volume)} />
        <StatBox label="Market cap" value={formatMarketCap(meta.marketCapCr)} />
      </div>

      <div className="border border-surface-border rounded-2xl shadow-card p-4 bg-surface-card">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>52w low {formatPrice(quote.low52w)}</span>
          <span>52w high {formatPrice(quote.high52w)}</span>
        </div>
        <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(100, Math.max(0, range52wPct * 100))}%` }} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">About</h2>
        <p className="text-sm text-slate-600">{meta.description}</p>
      </div>

      {peers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">{meta.sector} peers</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {peers.map((p) => (
              <Link
                key={p.symbol}
                to={`/stock/${p.symbol}`}
                className="border border-surface-border rounded-lg px-3 py-2 hover:border-accent/50 transition"
              >
                <div className="font-mono text-sm font-semibold">{p.symbol}</div>
                <div className={`text-xs tabular-nums ${p.pctChange >= 0 ? "text-up" : "text-down"}`}>{formatPct(p.pctChange)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Recent events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No recorded events for this stock recently.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="border border-surface-border rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{e.headline}</span>
                  <span
                    className={`text-[10px] uppercase px-1.5 py-0.5 rounded border ${
                      e.sentiment === "positive"
                        ? "text-up border-up/30 bg-up/10"
                        : e.sentiment === "negative"
                        ? "text-down border-down/30 bg-down/10"
                        : "text-slate-600 border-slate-300"
                    }`}
                  >
                    {e.sentiment}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{e.detail}</p>
                <p className="text-[11px] text-slate-400 mt-1">{new Date(e.occurredAt).toLocaleString("en-IN")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </AppShell>
  );
}

function StatBox({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="border border-surface-border rounded-xl px-3 py-2.5 bg-surface-card">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-sm font-mono font-semibold tabular-nums ${positive === undefined ? "text-slate-800" : positive ? "text-up" : "text-down"}`}>
        {value}
      </p>
    </div>
  );
}
