import { useEffect, useState } from "react";
import { api, type SymbolMeta } from "../lib/api";

interface Props {
  onClose: () => void;
  onAdd: (symbol: string) => Promise<void>;
  existingSymbols: Set<string>;
}

export default function AddSymbolModal({ onClose, onAdd, existingSymbols }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolMeta[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.searchSymbols(query).then((r) => setResults(r.results));
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  async function handleAdd(symbol: string) {
    setAdding(symbol);
    try {
      await onAdd(symbol);
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div
        className="bg-surface-card border border-surface-border rounded-2xl shadow-card w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-surface-border">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or company name…"
            className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No matching symbols</p>
          )}
          {results.map((s) => {
            const already = existingSymbols.has(s.symbol);
            return (
              <div key={s.symbol} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-raised">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{s.symbol}</span>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500 border border-surface-border rounded px-1.5 py-0.5">
                      {s.assetClass}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{s.name}</p>
                </div>
                <button
                  disabled={already || adding === s.symbol}
                  onClick={() => handleAdd(s.symbol)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {already ? "Added" : adding === s.symbol ? "Adding…" : "+ Add"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-surface-border text-right">
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
