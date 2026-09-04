import { Link } from "react-router-dom";
import type { WatchlistItem } from "../lib/api";
import { formatAge, formatPct, formatPrice, formatVolume } from "../lib/format";
import Sparkline from "./Sparkline";
import TierBadge from "./TierBadge";

interface Props {
  items: WatchlistItem[];
  onRemove: (symbol: string) => void;
  highlightSymbol: string | null;
}

export default function WatchlistTable({ items, onRemove, highlightSymbol }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="border border-surface-border rounded-2xl shadow-card overflow-hidden bg-surface-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-surface-border">
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 font-medium text-right">Price</th>
            <th className="px-4 py-3 font-medium text-right">Today</th>
            <th className="px-4 py-3 font-medium hidden md:table-cell">Trend</th>
            <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">Volume</th>
            <th className="px-4 py-3 font-medium">Attention since last visit</th>
            <th className="px-4 py-3 font-medium w-8"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const { symbol, meta, quote, attention } = item;
            if (!quote) {
              return (
                <tr key={symbol} className="border-b border-surface-border last:border-0">
                  <td colSpan={7} className="px-4 py-4 text-slate-500 text-sm">
                    {symbol} — data unavailable right now
                  </td>
                </tr>
              );
            }
            const dayPct = quote.prevClose > 0 ? (quote.price - quote.prevClose) / quote.prevClose : 0;
            const isHighlighted = highlightSymbol === symbol;
            const volRatio = quote.avgVolume > 0 ? quote.volume / quote.avgVolume : 0;

            return (
              <tr
                key={symbol}
                id={`row-${symbol}`}
                className={`border-b border-surface-border last:border-0 group transition-colors ${
                  isHighlighted ? "bg-accent/10" : "hover:bg-surface-raised"
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link to={`/stock/${symbol}`} className="font-mono font-semibold hover:text-accent">
                      {symbol}
                    </Link>
                    {quote.isStale && (
                      <span
                        title={`No update in ${formatAge(quote.ageMs)}`}
                        className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate max-w-[160px]">{meta?.name ?? symbol}</p>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">{formatPrice(quote.price)}</td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums text-sm ${dayPct >= 0 ? "text-up" : "text-down"}`}>
                  {formatPct(dayPct)}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <Sparkline data={quote.history} positive={dayPct >= 0} />
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <span className="text-slate-600 tabular-nums">{formatVolume(quote.volume)}</span>
                  {volRatio > 1.6 && <span className="ml-1.5 text-[10px] text-amber-700 font-medium">{volRatio.toFixed(1)}x</span>}
                </td>
                <td className="px-4 py-3">
                  {attention && attention.tier !== "none" ? (
                    <div className="flex items-center gap-2">
                      <TierBadge tier={attention.tier} />
                      <span className="text-xs font-medium tabular-nums text-slate-700">{attention.score}</span>
                      <span className={`text-xs font-medium tabular-nums ${attention.pctChange >= 0 ? "text-up" : "text-down"}`}>
                        {formatPct(attention.pctChange)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onRemove(symbol)}
                    className="md:opacity-0 md:group-hover:opacity-100 transition text-slate-500 hover:text-down text-xs"
                    title="Remove from watchlist"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
