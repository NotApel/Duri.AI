import { useContext, useRef, useState, useEffect } from "react"; // Added useEffect
import { AuthContext } from "../services/AuthContext";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { apiRequest } from "../services/api"; // Added apiRequest
import {
  LayoutDashboard,
  ClipboardList,
  Map,
  Hexagon,
  Settings,
  LogOut,
  TreeDeciduous,
  Brain, // === NEW ADDITION ===
  Bell,
  Menu,
} from "lucide-react";

const navigation = [
  {
    path: "/dashboard",
    label: "Dashboard",
    mobile: "Home",
    icon: LayoutDashboard,
  },
  { path: "/map", label: "Orchard Map", mobile: "Map", icon: Map },
  {
    path: "/analytics",
    label: "Harvest Logs",
    mobile: "Logs",
    icon: ClipboardList,
  },
  // === NEW ADDITION ===
  { path: "/training", label: "AI Training", mobile: "AI", icon: Brain },
  { path: "/nodes", label: "Node Status", mobile: "Nodes", icon: Hexagon },
  { path: "/plots", label: "Farm plots", mobile: "Plots", icon: TreeDeciduous },
  {
    path: "/notifications",
    label: "Notifications",
    mobile: "Alerts",
    icon: Bell,
  },
  { path: "/settings", label: "Settings", mobile: "Settings", icon: Settings },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const moreMenu = useRef(null);
  const { logout, sessionError, refresh } = useContext(AuthContext);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutPending = useRef(false);

  // NEW: Global Toast State
  const [globalToast, setGlobalToast] = useState("");

  // NEW: Global Retrain Polling
  useEffect(() => {
    let interval;
    const checkStatus = async () => {
      if (localStorage.getItem("isRetraining") === "true") {
        try {
          const data = await apiRequest("/analytics/retrain-status");
          if (data.status === "success") {
            localStorage.removeItem("isRetraining");
            setGlobalToast(
              "Training script finished. Model evaluation and device deployment remain unverified.",
            );
            setTimeout(() => setGlobalToast(""), 7000);
          } else if (data.status === "idle") {
            localStorage.removeItem("isRetraining");
            localStorage.removeItem("retrainStartTime");
          } else if (data.status === "failed") {
            localStorage.removeItem("isRetraining");
            setGlobalToast(
              "❌ AI Retraining failed. Please check backend logs.",
            );
            setTimeout(() => setGlobalToast(""), 7000);
          }
        } catch {
          // Ignore network errors during poll
        }
      }
    };
    interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleLogout() {
    if (logoutPending.current || !window.confirm("Log out of Duri.AI?")) return;
    logoutPending.current = true;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    } finally {
      logoutPending.current = false;
      setLoggingOut(false);
    }
  }

  const extraPaths = ["/plots", "/training", "/settings"];
  const links = (mobile = false, items = navigation) =>
    items.map(({ path, label, mobile: shortLabel, icon: Icon }) => (
      <NavLink
        key={path}
        to={path}
        onClick={() => {
          if (moreMenu.current) moreMenu.current.open = false;
        }}
        className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{mobile ? shortLabel : label}</span>
      </NavLink>
    ));

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <div className="app-brand">
          <TreeDeciduous size={22} aria-hidden="true" />
          DURI.AI
        </div>
        <nav aria-label="Main navigation">{links()}</nav>
        <button
          className="app-logout"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          <LogOut size={18} aria-hidden="true" />
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </aside>
      <header className="app-mobile-header">
        <span className="app-brand">
          <TreeDeciduous size={22} aria-hidden="true" />
          DURI.AI
        </span>
        <button
          className="ui-button"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </header>
      <main id="main-content" className="app-main">
        <p className="ui-notice app-preview">
          Development preview. Simulations are labelled. Hardware operation and
          model training remain unverified.
        </p>
        {sessionError && (
          <p className="ui-notice ui-error mb-4" role="alert">
            {sessionError}{" "}
            <button className="ui-button" onClick={refresh}>
              Retry session check
            </button>
          </p>
        )}
        {logoutError && (
          <p className="ui-notice ui-error mb-4" role="alert">
            {logoutError}
          </p>
        )}
        <Outlet />
      </main>
      <nav className="app-mobile-nav" aria-label="Mobile navigation">
        {links(
          true,
          navigation.filter((item) => !extraPaths.includes(item.path)),
        )}
        <details
          className="app-nav-more"
          ref={moreMenu}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary
            className={`app-nav-link${extraPaths.includes(location.pathname) ? " active" : ""}`}
          >
            <Menu size={18} aria-hidden="true" />
            <span>More</span>
          </summary>
          <div className="app-more-menu">
            {links(
              false,
              navigation.filter((item) => extraPaths.includes(item.path)),
            )}
          </div>
        </details>
      </nav>

      {/* NEW: GLOBAL TOAST NOTIFICATION */}
      {globalToast && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1e293b",
            color: "white",
            padding: "12px 24px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            fontWeight: "bold",
            transition: "all 0.3s ease",
          }}
        >
          {globalToast}
        </div>
      )}
    </div>
  );
}
