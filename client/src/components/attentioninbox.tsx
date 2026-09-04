import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WatchlistResponse } from "../lib/api";
import { formatAge, formatPct } from "../lib/format";
import TierBadge from "./TierBadge";

const DEFAULT_VISIBLE = 5;

interface Props {
  summary: WatchlistResponse["summary"];
  lastCheckpointAt: number | null;
  onDismissAll: () => void;
  onSnooze: (symbol: string) => void;
  onNotInteresting: (symbol: string) => void;
  dismissed: boolean;
}

// This is the home screen, not a banner above a table — the product's whole
// bet is that a watchlist's job is to protect your limited attention, not
// display everything with equal weight. So: capped hard by default (you
// have to explicitly ask for more), framed as things that interrupted you
// rather than dashboard metrics, and every card can be triaged away
// (snooze / not interesting) so the product visibly gets quieter about
// what you've told it doesn't matter — instead of showing the same alert
// forever.
export default function AttentionInbox({ summary, lastCheckpointAt, onDismissAll, onSnooze, onNotInteresting, dismissed }: Props) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  if (dismissed) return null;

  const { changes } = summary;
  const hasChanges = changes.length > 0;
  const visible = expanded ? changes : changes.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = changes.length - visible.length;

  if (!hasChanges) {
    return (
      <div className="border border-surface-border bg-surface-card rounded-2xl px-5 py-5 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-up/10 flex items-center justify-center text-up text-lg">✓</div>
          <div>
            <p className="text-sm font-medium text-slate-800">Nothing needs you right now</p>
            <p className="text-xs text-slate-500">
              {lastCheckpointAt ? `Checked in ${formatAge(Date.now() - lastCheckpointAt)}` : "No prior session recorded"} — everything on your watchlist is within normal range.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">What deserves your attention</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {lastCheckpointAt ? `Since you checked ${formatAge(Date.now() - lastCheckpointAt)}` : "Since your first session"} ·{" "}
            {changes.length} thing{changes.length === 1 ? "" : "s"} crossed the bar, showing {visible.length}
          </p>
        </div>
        <button onClick={onDismissAll} className="text-xs text-slate-500 hover:text-slate-700 shrink-0">
          Clear inbox ✕
        </button>
      </div>

      <div className="space-y-2">
        {visible.map((c) => (
          <div
            key={c.symbol}
            onClick={() => navigate(`/stock/${c.symbol}`)}
            className="group cursor-pointer bg-surface-card border border-surface-border hover:border-accent/40 rounded-xl px-4 py-3 transition"
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-mono text-sm font-semibold">{c.symbol}</span>
                  <TierBadge tier={c.tier} />
                  <span className={`text-xs font-medium tabular-nums ${c.pctChange >= 0 ? "text-up" : "text-down"}`}>
                    {formatPct(c.pctChange)}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-snug">{c.whyItMatters}</p>
              </div>

              {/* Always visible on touch-sized screens (hover doesn't exist there) and stacks below the card body instead of overlapping it; reveal-on-hover + inline placement only kicks in at sm+ where a pointer is likely. */}
              <div className="flex items-center gap-1.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSnooze(c.symbol);
                  }}
                  title="Seen it — don't show again until it moves further"
                  className="text-[11px] px-2 py-1 rounded-md border border-surface-border text-slate-600 hover:text-slate-800 hover:border-slate-400"
                >
                  Snooze
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onNotInteresting(c.symbol);
                  }}
                  title="Raise the bar for this stock's future alerts"
                  className="text-[11px] px-2 py-1 rounded-md border border-surface-border text-slate-600 hover:text-down hover:border-down/40"
                >
                  Not interesting
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-700 py-2 border border-dashed border-surface-border rounded-xl"
        >
          Show {hiddenCount} more
        </button>
      )}
      {expanded && changes.length > DEFAULT_VISIBLE && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-2 w-full text-center text-xs text-slate-500 hover:text-slate-700 py-2"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}
