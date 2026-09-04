// Reference universe: NSE-listed Indian equities plus the NIFTY 50 index
// itself. Prices/market caps are realistic ballpark figures for a demo, not
// live data. A real system would source this from an exchange reference-data
// feed (NSE's own symbol master, or a vendor like NSEpy/Kite Connect).
export interface SymbolMeta {
  symbol: string; // NSE trading symbol, e.g. "RELIANCE"
  name: string;
  sector: Sector;
  assetClass: "equity" | "index";
  basePrice: number;
  volatility: number; // annualized-ish factor used by the simulator
  marketCapCr: number; // approx market cap, INR crore
  niftyWeight: number; // approx weight in NIFTY 50, 0 if not a constituent
  beta: number; // sensitivity to the broad market factor
  description: string;
}

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

export const SECTORS: Sector[] = [
  "Energy",
  "IT",
  "Banking",
  "Financial Services",
  "FMCG",
  "Automobile",
  "Pharma",
  "Metals",
  "Infrastructure",
  "Telecom",
  "Consumer Durables",
  "Cement",
];

export const NIFTY50_SYMBOL = "NIFTY50";

export const SYMBOL_UNIVERSE: SymbolMeta[] = [
  { symbol: "RELIANCE", name: "Reliance Industries Ltd.", sector: "Energy", assetClass: "equity", basePrice: 2945, volatility: 0.19, marketCapCr: 1995000, niftyWeight: 0.092, beta: 1.05, description: "Diversified conglomerate spanning oil-to-chemicals, retail, and digital services (Jio)." },
  { symbol: "TCS", name: "Tata Consultancy Services Ltd.", sector: "IT", assetClass: "equity", basePrice: 4120, volatility: 0.17, marketCapCr: 1490000, niftyWeight: 0.038, beta: 0.82, description: "India's largest IT services exporter, serving global enterprise clients." },
  { symbol: "HDFCBANK", name: "HDFC Bank Ltd.", sector: "Banking", assetClass: "equity", basePrice: 1685, volatility: 0.18, marketCapCr: 1280000, niftyWeight: 0.104, beta: 1.1, description: "India's largest private-sector bank by assets." },
  { symbol: "INFY", name: "Infosys Ltd.", sector: "IT", assetClass: "equity", basePrice: 1845, volatility: 0.2, marketCapCr: 765000, niftyWeight: 0.056, beta: 0.88, description: "Global IT consulting and digital transformation services." },
  { symbol: "ICICIBANK", name: "ICICI Bank Ltd.", sector: "Banking", assetClass: "equity", basePrice: 1268, volatility: 0.21, marketCapCr: 890000, niftyWeight: 0.079, beta: 1.15, description: "Large private-sector bank with a broad retail and corporate lending book." },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd.", sector: "FMCG", assetClass: "equity", basePrice: 2415, volatility: 0.13, marketCapCr: 567000, niftyWeight: 0.026, beta: 0.55, description: "India's largest FMCG company — home care, beauty, and food products." },
  { symbol: "SBIN", name: "State Bank of India", sector: "Banking", assetClass: "equity", basePrice: 812, volatility: 0.24, marketCapCr: 724000, niftyWeight: 0.03, beta: 1.25, description: "India's largest public-sector bank." },
  { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd.", sector: "Telecom", assetClass: "equity", basePrice: 1598, volatility: 0.22, marketCapCr: 958000, niftyWeight: 0.041, beta: 0.95, description: "Second-largest telecom operator in India, also present across Africa." },
  { symbol: "ITC", name: "ITC Ltd.", sector: "FMCG", assetClass: "equity", basePrice: 468, volatility: 0.15, marketCapCr: 585000, niftyWeight: 0.028, beta: 0.6, description: "Diversified FMCG, cigarettes, hotels, and paperboard conglomerate." },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd.", sector: "Banking", assetClass: "equity", basePrice: 1782, volatility: 0.19, marketCapCr: 354000, niftyWeight: 0.021, beta: 1.0, description: "Private-sector bank and financial services group." },
  { symbol: "LT", name: "Larsen & Toubro Ltd.", sector: "Infrastructure", assetClass: "equity", basePrice: 3540, volatility: 0.23, marketCapCr: 497000, niftyWeight: 0.024, beta: 1.2, description: "Engineering, construction, and infrastructure conglomerate." },
  { symbol: "AXISBANK", name: "Axis Bank Ltd.", sector: "Banking", assetClass: "equity", basePrice: 1142, volatility: 0.22, marketCapCr: 352000, niftyWeight: 0.02, beta: 1.18, description: "Third-largest private-sector bank in India." },
  { symbol: "ASIANPAINT", name: "Asian Paints Ltd.", sector: "Consumer Durables", assetClass: "equity", basePrice: 2385, volatility: 0.18, marketCapCr: 228000, niftyWeight: 0.011, beta: 0.7, description: "India's largest paints and home-decor company." },
  { symbol: "MARUTI", name: "Maruti Suzuki India Ltd.", sector: "Automobile", assetClass: "equity", basePrice: 12480, volatility: 0.2, marketCapCr: 377000, niftyWeight: 0.017, beta: 0.9, description: "India's largest passenger-vehicle manufacturer." },
  { symbol: "TITAN", name: "Titan Company Ltd.", sector: "Consumer Durables", assetClass: "equity", basePrice: 3325, volatility: 0.21, marketCapCr: 295000, niftyWeight: 0.014, beta: 0.85, description: "Jewellery (Tanishq), watches, and eyewear retailer." },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd.", sector: "Pharma", assetClass: "equity", basePrice: 1785, volatility: 0.17, marketCapCr: 428000, niftyWeight: 0.019, beta: 0.65, description: "India's largest pharmaceutical company by revenue." },
  { symbol: "WIPRO", name: "Wipro Ltd.", sector: "IT", assetClass: "equity", basePrice: 548, volatility: 0.22, marketCapCr: 287000, niftyWeight: 0.011, beta: 0.9, description: "Global IT services and consulting company." },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd.", sector: "Cement", assetClass: "equity", basePrice: 11250, volatility: 0.2, marketCapCr: 325000, niftyWeight: 0.013, beta: 1.05, description: "India's largest cement manufacturer." },
  { symbol: "NESTLEIND", name: "Nestle India Ltd.", sector: "FMCG", assetClass: "equity", basePrice: 2245, volatility: 0.14, marketCapCr: 216000, niftyWeight: 0.009, beta: 0.5, description: "Packaged foods and beverages major, an Indian arm of Nestlé S.A." },
  { symbol: "TATAMOTORS", name: "Tata Motors Ltd.", sector: "Automobile", assetClass: "equity", basePrice: 785, volatility: 0.32, marketCapCr: 289000, niftyWeight: 0.014, beta: 1.4, description: "Commercial and passenger vehicles, owns Jaguar Land Rover." },
  { symbol: "TATASTEEL", name: "Tata Steel Ltd.", sector: "Metals", assetClass: "equity", basePrice: 148, volatility: 0.28, marketCapCr: 185000, niftyWeight: 0.009, beta: 1.35, description: "One of the world's largest steel producers." },
  { symbol: "ADANIENT", name: "Adani Enterprises Ltd.", sector: "Infrastructure", assetClass: "equity", basePrice: 2640, volatility: 0.35, marketCapCr: 305000, niftyWeight: 0.011, beta: 1.45, description: "Flagship incubator for the Adani Group's infrastructure ventures." },
  { symbol: "JSWSTEEL", name: "JSW Steel Ltd.", sector: "Metals", assetClass: "equity", basePrice: 985, volatility: 0.26, marketCapCr: 240000, niftyWeight: 0.01, beta: 1.3, description: "Major integrated steel producer." },
  { symbol: "NTPC", name: "NTPC Ltd.", sector: "Energy", assetClass: "equity", basePrice: 365, volatility: 0.16, marketCapCr: 354000, niftyWeight: 0.014, beta: 0.75, description: "India's largest power generation company (state-owned)." },
  { symbol: "POWERGRID", name: "Power Grid Corporation of India Ltd.", sector: "Energy", assetClass: "equity", basePrice: 328, volatility: 0.15, marketCapCr: 305000, niftyWeight: 0.012, beta: 0.6, description: "State-owned electricity transmission utility." },
];

export const SYMBOL_MAP = new Map(SYMBOL_UNIVERSE.map((s) => [s.symbol, s]));

export const NIFTY50_META: SymbolMeta = {
  symbol: NIFTY50_SYMBOL,
  name: "NIFTY 50",
  sector: "Broad Market",
  assetClass: "index",
  basePrice: 24350,
  volatility: 0.13,
  marketCapCr: 0,
  niftyWeight: 0,
  beta: 1,
  description: "NSE's flagship benchmark index tracking the 50 largest, most liquid Indian companies.",
};

export function sectorSymbols(sector: Sector): SymbolMeta[] {
  return SYMBOL_UNIVERSE.filter((s) => s.sector === sector);
}
