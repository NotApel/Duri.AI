// src/App.jsx
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import AuthScreen from "./components/AuthScreen";
import AppLayout from "./components/AppLayout";

const DashboardHome = lazy(() => import("./components/DashboardHome"));
const OrchardMap = lazy(() => import("./components/OrchardMap"));
const HarvestAnalytics = lazy(() => import("./components/HarvestAnalytics"));
const NodeManagement = lazy(() => import("./components/NodeManagement"));
const Settings = lazy(() => import("./components/Settings"));

// Wrapper to pass onLoginSuccess to AuthScreen
function AuthWrapper() {
  const navigate = useNavigate();

  const handleLoginSuccess = () => {
    navigate("/dashboard");
  };

  return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-green-900 p-6 text-slate-100">Loading page…</div>}>
      <Routes>
        {/* Auth routes */}
        <Route path="/" element={<AuthWrapper />} />
        <Route path="/login" element={<AuthWrapper />} />
        <Route path="/register" element={<AuthWrapper />} />

        {/* App routes with sidebar */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/map" element={<OrchardMap />} />
          <Route path="/analytics" element={<HarvestAnalytics />} />
          <Route path="/nodes" element={<NodeManagement />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
