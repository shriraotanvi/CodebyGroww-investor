import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Sidebar from "./Sidebar";
import GlobalSearch from "./GlobalSearch";
import ChatBot from "./ChatBot";
import { useAuth } from "../context/AuthContext";

interface Props {
  children: ReactNode;
  topBarRight?: ReactNode;
}

// Shared page frame: persistent sidebar at lg+, a lighter top bar (search +
// page-specific actions) everywhere, and a compact fallback nav below lg
// where the sidebar is hidden. Every page that used to render its own nav
// (Header / PublicNav) now renders this instead — same routes, same auth
// state, restyled only.
export default function AppShell({ children, topBarRight }: Props) {
  const { isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-surface-border">
          <div className="px-4 sm:px-6 py-3.5 flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 shrink-0 lg:hidden">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-accent to-indigo-600 flex items-center justify-center">
                <span className="text-white font-bold text-xs">₹</span>
              </div>
            </Link>
            <div className="flex-1 flex justify-center lg:justify-start">
              <GlobalSearch />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {topBarRight}
              <Link to="/dashboard" className="text-sm text-slate-500 hover:text-slate-800 hidden sm:inline-block lg:hidden">
                Dashboard
              </Link>
              <Link to="/market" className="text-sm text-slate-500 hover:text-slate-800 hidden sm:inline-block lg:hidden">
                Market
              </Link>
              {isAuthenticated ? (
                <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-600 lg:hidden">
                  Sign out
                </button>
              ) : (
                <Link to="/login" className="text-xs font-medium text-accent lg:hidden">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
      <ChatBot />
    </div>
  );
}
