import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, LayoutGrid, LineChart, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, type MarketOverview } from "../lib/api";
import { formatPct, formatPrice } from "../lib/format";

// Persistent left-rail navigation, restyled to match a light dashboard
// reference (GoStock on Dribbble) — visual language only, same routes and
// same auth/session data every other nav previously exposed.
export default function Sidebar() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const [overview, setOverview] = useState<MarketOverview | null>(null);

  useEffect(() => {
    api.overview().then(setOverview).catch(() => {});
    const interval = setInterval(() => {
      api.overview().then(setOverview).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
    { to: "/", label: "Watchlist", icon: LayoutGrid, match: (p: string) => p === "/" },
    { to: "/market", label: "Market", icon: LineChart, match: (p: string) => p.startsWith("/market") || p.startsWith("/sector") },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r border-surface-border bg-surface-card px-5 py-6">
      <Link to="/" className="flex items-center gap-2.5 mb-7 px-1">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-accent to-indigo-600 flex items-center justify-center shadow-glow">
          <span className="text-white font-bold text-sm">₹</span>
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900">INVESTO₹</span>
      </Link>

      {overview?.nifty && (
        <Link
          to="/market"
          className="block rounded-2xl bg-slate-900 text-white px-4 py-4 mb-7 hover:bg-slate-800 transition"
        >
          <p className="text-[11px] text-slate-400 mb-1">NIFTY 50</p>
          <div className="flex items-end justify-between">
            <span className="text-xl font-bold tabular-nums">{formatPrice(overview.nifty.price)}</span>
            <span className={`text-xs font-semibold tabular-nums ${overview.nifty.pctChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatPct(overview.nifty.pctChange)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {overview.marketStatus.isOpen ? "Market open" : "Market closed"} · {overview.marketStatus.istTime} IST
          </p>
        </Link>
      )}

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const active = item.match(location.pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                active ? "bg-accent/10 text-accent" : "text-slate-500 hover:bg-surface-raised hover:text-slate-800"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-surface-border">
        {isAuthenticated ? (
          <div className="flex items-center gap-2.5 px-1">
            <div className="h-9 w-9 rounded-full bg-surface-raised border border-surface-border flex items-center justify-center text-xs font-semibold text-slate-700 shrink-0">
              {(user?.displayName || user?.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{user?.displayName || user?.email}</p>
              <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <LogOut size={12} /> Sign out
              </button>
            </div>
          </div>
        ) : (
          <Link
            to="/login"
            className="block text-center text-sm font-medium bg-accent hover:bg-indigo-500 transition text-white px-3.5 py-2 rounded-lg"
          >
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
