import type { AttentionTier as ChangeTier } from "../lib/api";

const STYLES: Record<ChangeTier, string> = {
  major: "bg-violet-100 text-violet-700 border-violet-200",
  notable: "bg-amber-100 text-amber-700 border-amber-200",
  minor: "bg-slate-100 text-slate-600 border-slate-200",
  none: "bg-slate-100/50 text-slate-500 border-slate-200/50",
};

const LABELS: Record<ChangeTier, string> = {
  major: "Major",
  notable: "Notable",
  minor: "Minor",
  none: "Quiet",
};

export default function TierBadge({ tier }: { tier: ChangeTier }) {
  if (tier === "none") return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STYLES[tier]}`}>
      {LABELS[tier]}
    </span>
  );
}
