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
  ts: number; // ms epoch when this quote was produced by the source
  source: "mock" | "finnhub";
}

// Abstraction so a real data vendor can be swapped in without touching
// callers. The app runs entirely on MockProvider unless a real API key is
// configured (see finnhubProvider.ts), so it always works out of the box.
export interface MarketDataProvider {
  name: string;
  getQuotes(symbols: string[]): Promise<Map<string, Quote>>;
}
