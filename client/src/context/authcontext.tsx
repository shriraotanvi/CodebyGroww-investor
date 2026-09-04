import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getToken } from "../lib/api";

interface AuthUser {
  id: number;
  email: string;
  displayName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("watchlist_user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (!getToken()) setUser(null);
  }, []);

  const login = (token: string, u: AuthUser) => {
    localStorage.setItem("watchlist_token", token);
    localStorage.setItem("watchlist_user", JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("watchlist_token");
    localStorage.removeItem("watchlist_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
