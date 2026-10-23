// src/App.jsx
import "./styles/app.css";
import { useContext } from "react";
import AuthProvider from "./components/AuthProvider";
import { AuthContext } from "./services/AuthContext";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
  Link,
} from "react-router-dom";
import AuthScreen from "./components/AuthScreen";
import DetectionProvider from "./components/DetectionProvider";
import AppLayout from "./components/AppLayout";
import DashboardHome from "./components/DashboardHome";
import OrchardMap from "./components/OrchardMap";
import HarvestAnalytics from "./components/HarvestAnalytics";
import NodeManagement from "./components/NodeManagement";
import Settings from "./components/Settings";
import TrainingHistory from "./components/TrainingHistory"; // === NEW ADDITION ===

function LegacyDetectionRedirect() {
  const { eventId } = useParams();
  return <Navigate to={`/map/events/${encodeURIComponent(eventId)}`} replace />;
}

function AuthWrapper() {
  const { farmer } = useContext(AuthContext);
  const location = useLocation();
  return farmer ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <AuthScreen key={location.key} />
  );
}
function ProtectedApp() {
  const { farmer, signedOut, checking, sessionError, refresh } =
    useContext(AuthContext);
  if (checking)
    return (
      <main className="ui-auth">
        <p className="ui-notice" role="status">
          Checking your session…
        </p>
      </main>
    );
  if (sessionError && !farmer)
    return (
      <main className="ui-auth">
        <section className="ui-panel ui-auth-panel">
          <p className="ui-notice ui-error" role="alert">
            {sessionError}
          </p>
          <button className="ui-button" onClick={refresh}>
            Try again
          </button>
        </section>
      </main>
    );
  return farmer ? (
    <DetectionProvider
      key={String(farmer.farmer_id)}
      farmerId={farmer.farmer_id}
    >
      <AppLayout />
    </DetectionProvider>
  ) : (
    <Navigate to={signedOut ? "/" : "/login"} replace />
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Auth routes */}
          <Route path="/" element={<AuthWrapper />} />
          <Route path="/login" element={<AuthWrapper />} />
          <Route path="/register" element={<AuthWrapper />} />

          {/* App routes with sidebar */}
          <Route element={<ProtectedApp />}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route
              path="/detections"
              element={<Navigate to="/map" replace />}
            />
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
            
            {/* === THE MISSING ROUTE YOU NEEDED === */}
            <Route path="/training" element={<TrainingHistory />} />
            
            <Route path="/nodes" element={<NodeManagement />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="*"
              element={
                <section className="ui-panel">
                  <h1>Page not found</h1>
                  <p className="my-4">
                    This address doesn’t match a Duri.AI screen.
                  </p>
                  <Link className="ui-button primary" to="/dashboard">
                    Open dashboard
                  </Link>
                </section>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;