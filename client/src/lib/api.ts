const API_BASE = "/api";

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";

export type Sector =
  | "Energy"
  | "IT"
  | "Banking"
  | "Financial Services"
  | "FMCG"
  | "Automobile"
  | "Pharma"
  | "Metals"
  | "Infrastructure"
  | "Telecom"
  | "Consumer Durables"
  | "Cement"
  | "Broad Market";

export interface SymbolMeta {
  symbol: string;
  name: string;
  sector: Sector;
  assetClass: "equity" | "index";
  basePrice: number;
  volatility: number;
  marketCapCr: number;
  niftyWeight: number;
  beta: number;
  description: string;
}

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  high52w: number;
  low52w: number;
  volume: number;
  avgVolume: number;
  ts: number;
  source: string;
  history: number[];
  isStale: boolean;
  degraded: boolean;
  ageMs: number;
}

export type AttentionTier = "none" | "minor" | "notable" | "major";

export interface AttentionSignal {
  key: string;
  label: string;
  points: number;
}

export interface MarketEvent {
  id: number;
  symbol: string;
  type: string;
  headline: string;
  detail: string;
  sentiment: "positive" | "negative" | "neutral";
  importance: number;
  occurredAt: number;
}

export interface AttentionResult {
  symbol: string;
  score: number;
  tier: AttentionTier;
  pctChange: number;
  absChange: number;
  signals: AttentionSignal[];
  reasons: string[];
  whyItMatters: string;
  events: MarketEvent[];
  baselineAgeMs: number;
}

export interface WatchlistItem {
  symbol: string;
  meta: SymbolMeta | undefined;
  addedAt: number;
  quote: Quote | null;
  attention: AttentionResult | null;
}

export interface MarketStatus {
  session: "pre-open" | "open" | "closed" | "weekend";
  isOpen: boolean;
  istTime: string;
  nextTransition: string;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  summary: {
    totalTracked: number;
    majorCount: number;
    notableCount: number;
    minorCount: number;
    // Full list, sorted worst/biggest-first — not pre-capped. The client
    // decides how much to actually show (the inbox caps hard by default).
    changes: (AttentionResult & { symbol: string; name?: string })[];
  };
  lastCheckpointAt: number | null;
  marketStatus: MarketStatus;
}

export interface StockDetail {
  meta: SymbolMeta;
  quote: Quote;
  dayPctChange: number;
  context: {
    niftyDayPctChange: number;
    sectorDayPctChange: number;
    sector: Sector;
    sectorIndexLevel: number | null;
  };
  peers: { symbol: string; name: string; price: number; pctChange: number }[];
  events: MarketEvent[];
  isWatching: boolean;
  attention: AttentionResult | null;
  marketStatus: MarketStatus;
}

export interface MarketOverview {
  nifty: { symbol: string; price: number; pctChange: number; history: number[] } | null;
  sectors: { sector: Sector; level: number; pctChange: number }[];
  gainers: { symbol: string; price: number; pctChange: number }[];
  losers: { symbol: string; price: number; pctChange: number }[];
  marketStatus: MarketStatus;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getToken(): string | null {
  return localStorage.getItem("watchlist_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  register: (email: string, password: string, displayName?: string) =>
    request<{ token: string; user: { id: number; email: string; displayName?: string } }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: number; email: string; displayName?: string } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  demoLogin: () =>
    request<{ token: string; user: { id: number; email: string; displayName?: string } }>("/auth/demo", {
      method: "POST",
    }),
  getWatchlist: () => request<WatchlistResponse>("/watchlist"),
  addSymbol: (symbol: string) => request<{ ok: true }>("/watchlist", { method: "POST", body: JSON.stringify({ symbol }) }),
  removeSymbol: (symbol: string) => request<{ ok: true }>(`/watchlist/${symbol}`, { method: "DELETE" }),
  checkpoint: () => request<{ ok: true; checkpointedAt: number }>("/watchlist/checkpoint", { method: "POST" }),
  snoozeSymbol: (symbol: string) => request<{ ok: true }>(`/watchlist/${symbol}/snooze`, { method: "POST" }),
  notInteresting: (symbol: string) => request<{ ok: true }>(`/watchlist/${symbol}/not-interesting`, { method: "POST" }),
  simulateTime: (hours: number) =>
    request<{ ok: true; shockCount: number; hours: number }>("/market/simulate-time", {
      method: "POST",
      body: JSON.stringify({ hours }),
    }),
  resetSimulation: () => request<{ ok: true }>("/market/reset-simulation", { method: "POST" }),
  sessionStart: () => request<{ ok: true }>("/watchlist/session-start", { method: "POST" }),
  searchSymbols: (q: string) => request<{ results: SymbolMeta[] }>(`/market/symbols?q=${encodeURIComponent(q)}`),
  movers: () => request<{ gainers: { symbol: string; price: number; pctChange: number }[]; losers: { symbol: string; price: number; pctChange: number }[] }>("/market/movers"),
  overview: () => request<MarketOverview>("/market/overview"),
  sector: (sector: string) =>
    request<{ sector: Sector; index: { level: number; pctChange: number } | null; members: { symbol: string; name: string; price: number; pctChange: number }[] }>(
      `/market/sectors/${encodeURIComponent(sector)}`
    ),
  stockDetail: (symbol: string) => request<StockDetail>(`/stocks/${symbol}`),
  stockEvents: (symbol: string) => request<{ events: MarketEvent[] }>(`/stocks/${symbol}/events`),
  stockHistory: (symbol: string, range: ChartRange) =>
    request<{ range: ChartRange; bars: { date?: string; close?: number; high?: number; low?: number; volume?: number; price?: number }[] }>(
      `/stocks/${symbol}/history?range=${range}`
    ),
  health: () => request<{ provider: string; lastTickAt: number; trackedSymbols: number }>("/market/health"),
};

export { ApiError, getToken };
