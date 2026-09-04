import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatPct, formatPrice } from "../lib/format";
import AppShell from "../components/AppShell";

interface SectorData {
  sector: string;
  index: { level: number; pctChange: number } | null;
  members: { symbol: string; name: string; price: number; pctChange: number }[];
}

export default function SectorDetail() {
  const { sector = "" } = useParams();
  const [data, setData] = useState<SectorData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .sector(sector)
      .then(setData)
      .catch(() => setError("Sector not found"));
  }, [sector]);

  if (error) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <Link to="/market" className="text-sm text-accent hover:underline">
            ← Back to market
          </Link>
          <p className="mt-4 text-sm text-down">{error}</p>
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

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link to="/market" className="text-sm text-accent hover:underline">
          ← Back to market
        </Link>

        <div>
          <h1 className="text-2xl font-bold">{data.sector}</h1>
          {data.index && (
            <div className="flex items-end gap-3 mt-1">
              <span className="text-xl font-mono tabular-nums">{data.index.level.toFixed(2)}</span>
              <span className={`text-sm font-mono tabular-nums ${data.index.pctChange >= 0 ? "text-up" : "text-down"}`}>
                {formatPct(data.index.pctChange)} today
              </span>
            </div>
          )}
        </div>

        <div className="border border-surface-border rounded-2xl shadow-card overflow-hidden bg-surface-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-surface-border">
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-right">Today</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.symbol} className="border-b border-surface-border last:border-0 hover:bg-surface-raised">
                    <td className="px-4 py-3">
                      <Link to={`/stock/${m.symbol}`} className="font-mono font-semibold hover:text-accent">
                        {m.symbol}
                      </Link>
                      <p className="text-xs text-slate-500">{m.name}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatPrice(m.price)}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${m.pctChange >= 0 ? "text-up" : "text-down"}`}>
                      {formatPct(m.pctChange)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
