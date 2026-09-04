import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, getToken, type WatchlistResponse } from "../lib/api";
import AppShell from "../components/AppShell";
import AttentionInbox from "../components/AttentionInbox";
import WatchlistTable from "../components/WatchlistTable";
import AddSymbolModal from "../components/AddSymbolModal";
import MarketStrip from "../components/MarketStrip";
import DemoControls from "../components/DemoControls";

const POLL_MS = 5000;

function checkpointBeacon() {
  const token = getToken();
  if (!token) return;
  fetch("/api/watchlist/checkpoint", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}

type View = "inbox" | "all";

export default function Dashboard() {
  const [data, setData] = useState<WatchlistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [inboxDismissed, setInboxDismissed] = useState(false);
  const [simNotice, setSimNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>("inbox");
  const checkpointedThisSession = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getWatchlist();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Retrying…");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.sessionStart().catch(() => {});
    refresh();
    const interval = setInterval(refresh, POLL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && !checkpointedThisSession.current) {
        checkpointBeacon();
        checkpointedThisSession.current = true;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleVisibility);
    };
  }, [refresh]);

  async function handleDismissAll() {
    setInboxDismissed(true);
    await api.checkpoint().catch(() => {});
    checkpointedThisSession.current = true;
    refresh();
  }

  async function handleSnooze(symbol: string) {
    await api.snoozeSymbol(symbol).catch(() => {});
    refresh();
  }

  async function handleNotInteresting(symbol: string) {
    await api.notInteresting(symbol).catch(() => {});
    refresh();
  }

  async function handleAdd(symbol: string) {
    await api.addSymbol(symbol);
    await refresh();
  }

  async function handleRemove(symbol: string) {
    await api.removeSymbol(symbol);
    await refresh();
  }

  async function handleSimulated(result: { hours: number; shockCount: number }) {
    setInboxDismissed(false);
    setView("inbox");
    await refresh();
    setSimNotice(
      `Simulated ${result.hours >= 24 ? `${Math.round(result.hours / 24)} day(s)` : `${result.hours}h`} passing — ${result.shockCount} market event${result.shockCount === 1 ? "" : "s"} occurred.`
    );
    setTimeout(() => setSimNotice(null), 6000);
  }

  async function handleReset() {
    // Reset restores the shared market to its boot state; also re-baseline
    // this user so their inbox reflects that clean state immediately
    // instead of comparing against a baseline captured mid-simulation.
    await api.checkpoint().catch(() => {});
    setInboxDismissed(false);
    await refresh();
    setSimNotice("Simulation reset — market restored to its starting state.");
    setTimeout(() => setSimNotice(null), 4000);
  }

  const existingSymbols = new Set(data?.items.map((i) => i.symbol) ?? []);

  return (
    <AppShell
      topBarRight={
        <button
          onClick={() => setShowAddModal(true)}
          className="text-sm font-medium bg-accent hover:bg-indigo-500 transition text-white px-3.5 py-1.5 rounded-lg"
        >
          + Add symbol
        </button>
      }
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading && (
          <div className="space-y-3">
            <div className="h-20 bg-surface-card border border-surface-border rounded-2xl shadow-card animate-pulse" />
            <div className="h-64 bg-surface-card border border-surface-border rounded-2xl shadow-card animate-pulse" />
          </div>
        )}

        {!loading && error && !data && (
          <div className="border border-down/30 bg-down/5 rounded-2xl px-5 py-6 text-center">
            <p className="text-sm font-medium text-down mb-1">Couldn't load your watchlist</p>
            <p className="text-xs text-slate-500 mb-3">{error}</p>
            <button onClick={refresh} className="text-xs font-medium bg-surface-raised border border-surface-border px-3 py-1.5 rounded-lg hover:border-accent/50">
              Try again
            </button>
          </div>
        )}

        {!loading && data && (
          <>
            {error && (
              <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Live updates paused — showing last known data. {error}
              </div>
            )}

            <MarketStrip />

            <DemoControls onSimulated={handleSimulated} onReset={handleReset} />

            {simNotice && (
              <div className="mb-6 text-sm text-accent bg-accent/10 border border-accent/25 rounded-xl px-4 py-2.5">
                {simNotice}
              </div>
            )}

            {data.items.length === 0 ? (
              <div className="border border-dashed border-surface-border rounded-2xl px-6 py-16 text-center">
                <p className="text-slate-700 font-medium mb-1">Your watchlist is empty</p>
                <p className="text-sm text-slate-500 mb-4">Add a few symbols to start tracking meaningful moves.</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="text-sm font-medium bg-accent hover:bg-indigo-500 transition text-white px-4 py-2 rounded-lg"
                >
                  + Add your first symbol
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-1 mb-4 bg-surface-raised rounded-lg p-1 w-fit">
                  <button
                    onClick={() => setView("inbox")}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                      view === "inbox" ? "bg-accent text-white" : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    Inbox
                  </button>
                  <button
                    onClick={() => setView("all")}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                      view === "all" ? "bg-accent text-white" : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    All stocks ({data.items.length})
                  </button>
                </div>

                {view === "inbox" ? (
                  <AttentionInbox
                    summary={data.summary}
                    lastCheckpointAt={data.lastCheckpointAt}
                    onDismissAll={handleDismissAll}
                    onSnooze={handleSnooze}
                    onNotInteresting={handleNotInteresting}
                    dismissed={inboxDismissed}
                  />
                ) : (
                  <WatchlistTable items={data.items} onRemove={handleRemove} highlightSymbol={null} />
                )}
              </>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <AddSymbolModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} existingSymbols={existingSymbols} />
      )}
    </AppShell>
  );
}
