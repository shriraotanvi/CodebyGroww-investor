import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { api, type MarketOverview, type WatchlistResponse } from "../lib/api";
import { formatPct, formatPrice } from "../lib/format";
import { useAuth } from "../context/AuthContext";

interface Message {
  role: "user" | "bot";
  text: string;
}

const QUICK_QUESTIONS = [
  "Is the market open?",
  "What's my watchlist status?",
  "Top gainer today?",
  "What is an attention score?",
  "How do I add a stock?",
];

// Deliberately a rule-based FAQ bot, not a wired-up LLM — "basic questions"
// answered honestly from the app's own live data (NIFTY, watchlist summary,
// gainers/losers) plus canned explanations of product concepts. Answering
// from real state rather than a hardcoded string wherever possible is what
// keeps this useful instead of a decoration.
function answer(query: string, overview: MarketOverview | null, watchlist: WatchlistResponse | null, isAuthenticated: boolean): string {
  const q = query.toLowerCase();

  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("hello", "hi ", "hey") || q.trim() === "hi") {
    return "Hey! I can answer basic questions about the market and your watchlist — try one of the suggestions below, or ask about NIFTY, your watchlist, attention scores, or how snooze works.";
  }

  if (has("market open", "market closed", "is the market", "trading hours", "market status")) {
    if (!overview) return "I can't reach live market data right now — try again in a moment.";
    return `The market is currently ${overview.marketStatus.isOpen ? "open" : overview.marketStatus.session}. It's ${overview.marketStatus.istTime} IST. ${overview.marketStatus.nextTransition}.`;
  }

  if (has("nifty")) {
    if (!overview?.nifty) return "I can't reach NIFTY data right now — try again in a moment.";
    return `NIFTY 50 is at ${formatPrice(overview.nifty.price)}, ${formatPct(overview.nifty.pctChange)} today.`;
  }

  if (has("top gainer", "biggest gainer", "who's up", "best performer")) {
    const g = overview?.gainers[0];
    if (!g) return "I don't have gainers data right now — try again in a moment.";
    return `${g.symbol} is today's top gainer, up ${formatPct(g.pctChange)}.`;
  }

  if (has("top loser", "biggest loser", "who's down", "worst performer")) {
    const l = overview?.losers[0];
    if (!l) return "I don't have losers data right now — try again in a moment.";
    return `${l.symbol} is today's top loser, down ${formatPct(Math.abs(l.pctChange) * -1)}.`;
  }

  if (has("sector")) {
    const top = overview?.sectors[0];
    if (!top) return "I don't have sector data right now — try again in a moment.";
    return `${top.sector} is the best-performing sector today at ${formatPct(top.pctChange)}. Open the Market page to see all sectors.`;
  }

  if (has("watchlist status", "my watchlist", "what's on my watch", "how's my watchlist")) {
    if (!isAuthenticated) return "Sign in (or try the instant demo) to get a watchlist — then I can tell you what's changed on it.";
    if (!watchlist) return "I can't reach your watchlist right now — try again in a moment.";
    const { totalTracked, majorCount, notableCount, minorCount } = watchlist.summary;
    if (totalTracked === 0) return "Your watchlist is empty — search for a stock and add it to start tracking.";
    const changedCount = majorCount + notableCount + minorCount;
    if (changedCount === 0) return `You're tracking ${totalTracked} stock${totalTracked === 1 ? "" : "s"}, and everything is quiet since you last checked.`;
    return `You're tracking ${totalTracked} stock${totalTracked === 1 ? "" : "s"}. ${changedCount} need${changedCount === 1 ? "s" : ""} your attention: ${majorCount} major, ${notableCount} notable, ${minorCount} minor.`;
  }

  if (has("top mover", "biggest mover", "what changed", "what's changed")) {
    if (!isAuthenticated) return "Sign in to get a personalized watchlist digest.";
    const top = watchlist?.summary.changes[0];
    if (!top) return "Nothing on your watchlist has crossed the attention bar since you last checked.";
    return `${top.symbol} is your top mover right now: ${top.whyItMatters}`;
  }

  if (has("attention score", "attention scores")) {
    return "The attention score (0-100) combines several signals — price move scaled by the stock's own volatility, relative volume, vs. NIFTY, vs. its sector, 52-week crossings, and corporate events — into one explainable number. It's not just \"price moved X%.\"";
  }

  if (has("meaningful change", "meaningful")) {
    return "A change counts as \"meaningful\" when it clears a bar tuned to that specific stock's normal behavior — a 1.5% move means more for a sleepy stock than a volatile one — combined with signals like volume, 52-week crossings, and news, not a flat percentage threshold applied to everyone.";
  }

  if (has("snooze")) {
    return "Snooze marks a stock as \"seen\" — it re-baselines that one stock immediately so it drops out of your inbox and won't reappear until it moves again from here.";
  }

  if (has("not interesting")) {
    return "\"Not interesting\" does what Snooze does, plus permanently raises the bar for that stock's future alerts — so the inbox gets quieter about things you've told it don't matter, instead of repeating the same alert forever.";
  }

  if (has("simulate", "fast forward", "fast-forward", "time passing")) {
    return "The \"Simulate time passing\" control on your watchlist compresses hours of market movement into an instant, so you can see the \"what changed\" experience without waiting. Hit Reset to undo it and try a different duration cleanly.";
  }

  if (has("how do i add", "add a stock", "add symbol", "add to watchlist")) {
    return "Search for a stock using the search bar at the top, open its page, and click \"+ Add to watchlist\" — or use the \"+ Add symbol\" button on your watchlist page.";
  }

  if (has("52", "52-week", "52 week")) {
    return "The 52-week high/low range is shown on every stock's page as a bar between its low and high over the past year — crossing either one is always flagged as attention-worthy, regardless of the percentage move.";
  }

  if (has("help", "what can you", "what do you do")) {
    return "I can answer basic questions about the market and your watchlist — try: \"Is the market open?\", \"What's my watchlist status?\", \"Top gainer today?\", \"What is an attention score?\", or \"How do I add a stock?\"";
  }

  return "I didn't quite catch that. Try asking about NIFTY, your watchlist, today's top gainer/loser, sectors, attention scores, or how snooze works — or tap one of the suggestions below.";
}

export default function ChatBot() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: "Hi! Ask me a basic question about the market or your watchlist." },
  ]);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistResponse | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.overview().then(setOverview).catch(() => {});
    if (isAuthenticated) api.getWatchlist().then(setWatchlist).catch(() => {});
  }, [open, isAuthenticated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const botReply = answer(trimmed, overview, watchlist, isAuthenticated);
    setMessages((m) => [...m, { role: "user", text: trimmed }, { role: "bot", text: botReply }]);
    setInput("");
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-accent hover:bg-indigo-500 text-white shadow-soft flex items-center justify-center transition"
        title="Ask a question"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-[340px] max-w-[calc(100vw-2.5rem)] bg-surface-card border border-surface-border rounded-2xl shadow-soft flex flex-col overflow-hidden" style={{ height: 440 }}>
          <div className="px-4 py-3 border-b border-surface-border bg-surface-raised">
            <p className="text-sm font-semibold text-slate-900">Ask INVESTO₹</p>
            <p className="text-[11px] text-slate-500">Basic questions, answered from live data</p>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`text-sm px-3 py-2 rounded-xl max-w-[85%] leading-snug ${
                    m.role === "user" ? "bg-accent text-white rounded-br-sm" : "bg-surface-raised text-slate-800 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>

          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="text-[11px] px-2 py-1 rounded-full border border-surface-border text-slate-600 hover:border-accent/50 hover:text-accent transition"
              >
                {q}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-3 border-t border-surface-border flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              className="flex-1 bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <button
              type="submit"
              className="h-9 w-9 shrink-0 rounded-lg bg-accent hover:bg-indigo-500 text-white flex items-center justify-center transition"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
