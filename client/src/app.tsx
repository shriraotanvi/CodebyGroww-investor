import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DashboardOverview from "./pages/DashboardOverview";
import StockDetail from "./pages/StockDetail";
import MarketOverview from "./pages/MarketOverview";
import SectorDetail from "./pages/SectorDetail";

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/dashboard" element={isAuthenticated ? <DashboardOverview /> : <Navigate to="/login" replace />} />
      <Route path="/stock/:symbol" element={<StockDetail />} />
      <Route path="/market" element={<MarketOverview />} />
      <Route path="/sector/:sector" element={<SectorDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
