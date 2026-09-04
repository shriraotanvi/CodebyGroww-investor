import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MarketOverview as MarketOverviewData } from "../lib/api";
import { formatPct, formatPrice } from "../lib/format";
import Sparkline from "../components/Sparkline";
import AppShell from "../components/AppShell";

// Market home: NIFTY 50, sector performance, and full gainers/losers lists.
// Functional-first per current priority — plain lists/cards, no dedicated
// visual design pass yet.
export default function MarketOverview() {
  const [data, setData] = useState<MarketOverviewData | null>(null);

  useEffect(() => {
    api.overview().then(setData).catch(() => {});
    const interval = setInterval(() => {
      api.overview().then(setData).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <div className="h-40 bg-surface-card border border-surface-border rounded-2xl shadow-card animate-pulse" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold font-mono">NIFTY 50</h1>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              data.marketStatus.isOpen ? "border-up/30 text-up bg-up/10" : "border-slate-300 text-slate-600 bg-slate-100/40"
            }`}
          >
            {data.marketStatus.session === "open" ? "Market open" : data.marketStatus.session} · {data.marketStatus.istTime} IST
          </span>
        </div>
        {data.nifty && (
          <>
            <div className="flex items-end gap-3 mb-3">
              <span className="text-3xl font-bold font-mono tabular-nums">{formatPrice(data.nifty.price)}</span>
              <span className={`text-lg font-mono tabular-nums ${data.nifty.pctChange >= 0 ? "text-up" : "text-down"}`}>
                {formatPct(data.nifty.pctChange)}
              </span>
            </div>
            <div className="border border-surface-border rounded-2xl shadow-card p-4 bg-surface-card">
              <Sparkline data={data.nifty.history} positive={data.nifty.pctChange >= 0} width={600} height={100} />
            </div>
          </>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Sectors</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {data.sectors.map((s) => (
            <Link
              key={s.sector}
              to={`/sector/${encodeURIComponent(s.sector)}`}
              className="border border-surface-border rounded-lg px-3 py-2.5 hover:border-accent/50 transition"
            >
              <div className="text-sm font-medium">{s.sector}</div>
              <div className={`text-xs font-mono tabular-nums ${s.pctChange >= 0 ? "text-up" : "text-down"}`}>{formatPct(s.pctChange)}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-semibold mb-2 text-up">Top gainers</h2>
          <div className="space-y-1.5">
            {data.gainers.map((m) => (
              <Link
                key={m.symbol}
                to={`/stock/${m.symbol}`}
                className="flex items-center justify-between border border-surface-border rounded-lg px-3 py-2 hover:border-up/40 transition"
              >
                <span className="font-mono text-sm font-semibold">{m.symbol}</span>
                <span className="text-sm font-mono tabular-nums text-up">{formatPct(m.pctChange)}</span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold mb-2 text-down">Top losers</h2>
          <div className="space-y-1.5">
            {data.losers.map((m) => (
              <Link
                key={m.symbol}
                to={`/stock/${m.symbol}`}
                className="flex items-center justify-between border border-surface-border rounded-lg px-3 py-2 hover:border-down/40 transition"
              >
                <span className="font-mono text-sm font-semibold">{m.symbol}</span>
                <span className="text-sm font-mono tabular-nums text-down">{formatPct(m.pctChange)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
