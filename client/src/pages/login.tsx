import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = mode === "login" ? await api.login(email, password) : await api.register(email, password, displayName);
      login(res.token, res.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setError(null);
    setLoading(true);
    try {
      const res = await api.demoLogin();
      login(res.token, res.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start demo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-accent to-indigo-600 flex items-center justify-center shadow-glow">
              <span className="text-white font-bold text-lg">₹</span>
            </div>
            <span className="text-2xl font-bold tracking-tight">INVESTO₹</span>
          </div>
          <p className="text-slate-600 text-sm">
            A watchlist that tells you what actually changed — not just what moved.
          </p>
        </div>

        <div className="bg-surface-card border border-surface-border rounded-2xl shadow-card p-6 shadow-xl">
          <div className="flex mb-6 bg-surface-raised rounded-lg p-1 text-sm font-medium">
            <button
              className={`flex-1 py-2 rounded-md transition ${mode === "login" ? "bg-accent text-white" : "text-slate-600 hover:text-slate-800"}`}
              onClick={() => setMode("login")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`flex-1 py-2 rounded-md transition ${mode === "register" ? "bg-accent text-white" : "text-slate-600 hover:text-slate-800"}`}
              onClick={() => setMode("register")}
              type="button"
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Display name</label>
                <input
                  className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jamie Chen"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
              <input
                type="email"
                required
                className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Password</label>
              <input
                type="password"
                required
                minLength={6}
                className="w-full bg-surface-raised border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <div className="text-sm text-down bg-down/10 border border-down/20 rounded-lg px-3 py-2">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-indigo-500 transition text-white font-medium py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-surface-card px-2 text-slate-500">or</span>
            </div>
          </div>

          <button
            onClick={handleDemo}
            disabled={loading}
            type="button"
            className="w-full border border-surface-border hover:border-accent/50 hover:bg-accent/5 transition text-slate-800 font-medium py-2.5 rounded-lg text-sm disabled:opacity-50"
          >
            Try instant demo →
          </button>
          <p className="text-center text-xs text-slate-500 mt-3">
            Loads a preset watchlist with 18 hours of simulated activity to explore.
          </p>
        </div>
      </div>
    </div>
  );
}
