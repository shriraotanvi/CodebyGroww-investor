import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type SymbolMeta } from "../lib/api";

// Minimal, functional search-to-detail flow (DISCOVER -> SEARCH -> VIEW
// STOCK). Deliberately unstyled beyond the app's base tokens per current
// priority: functionality over visual polish.
export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolMeta[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.searchSymbols(query).then((r) => setResults(r.results));
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function go(symbol: string) {
    setOpen(false);
    setQuery("");
    navigate(`/stock/${symbol}`);
  }

  return (
    <div className="relative w-full max-w-sm" ref={containerRef}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search stocks (e.g. RELIANCE, TCS)"
        className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-full bg-surface-card border border-surface-border rounded-lg shadow-xl z-40 max-h-72 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.symbol}
              onClick={() => go(r.symbol)}
              className="w-full text-left px-3 py-2 hover:bg-surface-raised flex items-center justify-between"
            >
              <div>
                <span className="font-mono text-sm font-semibold">{r.symbol}</span>
                <span className="text-xs text-slate-500 ml-2">{r.name}</span>
              </div>
              <span className="text-[10px] uppercase text-slate-500 border border-surface-border rounded px-1.5 py-0.5">
                {r.sector}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
