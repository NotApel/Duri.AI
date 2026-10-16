// src/App.jsx
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
} from "react-router-dom";
import AuthScreen from "./components/AuthScreen";
import AppLayout from "./components/AppLayout";
import DashboardHome from "./components/DashboardHome";
import OrchardMap from "./components/OrchardMap";
import HarvestAnalytics from "./components/HarvestAnalytics";
import NodeManagement from "./components/NodeManagement";
import Settings from "./components/Settings";

function LegacyDetectionRedirect() {
  const { eventId } = useParams();
  return <Navigate to={`/map/events/${encodeURIComponent(eventId)}`} replace />;
}

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
      <Routes>
        {/* Auth routes */}
        <Route path="/" element={<AuthWrapper />} />
        <Route path="/login" element={<AuthWrapper />} />
        <Route path="/register" element={<AuthWrapper />} />

        {/* App routes with sidebar */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/detections" element={<Navigate to="/map" replace />} />
          <Route
            path="/detections/:eventId"
            element={<LegacyDetectionRedirect />}
          />
          <Route path="/map" element={<OrchardMap />} />
          <Route path="/map/events/:eventId" element={<OrchardMap />} />
          <Route path="/analytics" element={<HarvestAnalytics />} />
          <Route
            path="/analytics/events/:eventId"
            element={<LegacyDetectionRedirect />}
          />
          <Route path="/nodes" element={<NodeManagement />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
