import { useState } from "react";
import { api } from "../lib/api";

interface Props {
  onSimulated: (result: { hours: number; shockCount: number }) => void;
  onReset: () => void;
}

const OPTIONS: { label: string; hours: number }[] = [
  { label: "+4h", hours: 4 },
  { label: "+8h", hours: 8 },
  { label: "+1 day", hours: 24 },
  { label: "+3 days", hours: 72 },
];

// Demo-only control: compresses simulated market hours into an instant
// call so "what changed while you were away" is demonstrable live, without
// actually waiting. Doesn't touch any user's baseline — only the shared
// market advances — so the effect on the next watchlist fetch is exactly
// what returning after a real absence would look like.
//
// +N clicks are cumulative (each one really does simulate more time
// passing on top of the last, same as reality would) — total elapsed time
// is tracked and shown here so that's never a surprise. "Reset" undoes all
// of it back to the server's boot state, so trying +4h and then wanting to
// see +8h *instead* means resetting to a clean baseline first rather than
// silently ending up at +12h.
export default function DemoControls({ onSimulated, onReset }: Props) {
  const [busy, setBusy] = useState<number | "reset" | null>(null);
  const [totalHours, setTotalHours] = useState(0);

  async function handleClick(hours: number) {
    setBusy(hours);
    try {
      const result = await api.simulateTime(hours);
      setTotalHours((t) => t + hours);
      onSimulated(result);
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    setBusy("reset");
    try {
      await api.resetSimulation();
      setTotalHours(0);
      onReset();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border border-dashed border-surface-border rounded-2xl px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
      <span className="text-xs text-slate-500 font-medium">⏩ Simulate time passing (demo)</span>
      <div className="flex gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o.hours}
            onClick={() => handleClick(o.hours)}
            disabled={busy !== null}
            className="text-xs font-medium px-2.5 py-1 rounded-md border border-surface-border text-slate-700 hover:border-accent/50 hover:text-accent transition disabled:opacity-50"
          >
            {busy === o.hours ? "Simulating…" : o.label}
          </button>
        ))}
      </div>

      {totalHours > 0 && (
        <span className="text-[11px] font-medium text-accent bg-accent/10 px-2 py-1 rounded-md">
          {totalHours >= 24 ? `${(totalHours / 24).toFixed(totalHours % 24 === 0 ? 0 : 1)}d` : `${totalHours}h`} simulated so far
        </span>
      )}

      <button
        onClick={handleReset}
        disabled={busy !== null || totalHours === 0}
        className="text-xs font-medium px-2.5 py-1 rounded-md border border-surface-border text-slate-500 hover:border-down/40 hover:text-down transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy === "reset" ? "Resetting…" : "↺ Reset"}
      </button>

      <span className="text-[11px] text-slate-400">Advances the market only — your "last checked" baseline stays put.</span>
    </div>
  );
}
