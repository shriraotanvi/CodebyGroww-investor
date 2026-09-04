import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MarketOverview } from "../lib/api";
import { formatPct, formatPrice } from "../lib/format";

// Minimal market-overview surface for the dashboard: NIFTY level, session
// status, and top movers. Functional-first per current priority — a real
// pass would turn this into a proper market-home page with sector cards.
export default function MarketStrip() {
  const [data, setData] = useState<MarketOverview | null>(null);

  useEffect(() => {
    api.overview().then(setData).catch(() => {});
    const interval = setInterval(() => {
      api.overview().then(setData).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  return (
    <div className="border border-surface-border bg-surface-card rounded-2xl px-5 py-3.5 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      {data.nifty && (
        <Link to="/market" className="flex items-center gap-2 hover:opacity-80">
          <span className="text-slate-600 text-xs">NIFTY 50</span>
          <span className="font-mono font-semibold">{formatPrice(data.nifty.price)}</span>
          <span className={`font-mono text-xs ${data.nifty.pctChange >= 0 ? "text-up" : "text-down"}`}>
            {formatPct(data.nifty.pctChange)}
          </span>
        </Link>
      )}
      <span
        className={`text-[11px] px-2 py-0.5 rounded-full border ${
          data.marketStatus.isOpen
            ? "border-up/30 text-up bg-up/10"
            : "border-slate-300 text-slate-600 bg-slate-100/40"
        }`}
      >
        {data.marketStatus.session === "open" ? "Market open" : data.marketStatus.session === "pre-open" ? "Pre-open" : data.marketStatus.session === "weekend" ? "Weekend — closed" : "Market closed"}
        {" · "}
        {data.marketStatus.istTime} IST
      </span>
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>Top gainer:</span>
        {data.gainers[0] && (
          <Link to={`/stock/${data.gainers[0].symbol}`} className="text-up font-mono hover:underline">
            {data.gainers[0].symbol} {formatPct(data.gainers[0].pctChange)}
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <span>Top loser:</span>
        {data.losers[0] && (
          <Link to={`/stock/${data.losers[0].symbol}`} className="text-down font-mono hover:underline">
            {data.losers[0].symbol} {formatPct(data.losers[0].pctChange)}
          </Link>
        )}
      </div>
    </div>
  );
}
