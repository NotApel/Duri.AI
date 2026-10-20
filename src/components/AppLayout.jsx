import { useContext, useRef, useState } from "react";
import { AuthContext } from "../services/AuthContext";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Map,
  Hexagon,
  Settings,
  LogOut,
  TreeDeciduous,
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
  { path: "/nodes", label: "Node Status", mobile: "Nodes", icon: Hexagon },
  { path: "/settings", label: "Settings", mobile: "Settings", icon: Settings },
];
export default function AppLayout() {
  const navigate = useNavigate();
  const { logout, sessionError, refresh } = useContext(AuthContext);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutPending = useRef(false);
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
  const links = (mobile = false) =>
    navigation.map(({ path, label, mobile: shortLabel, icon: Icon }) => (
      <NavLink
        key={path}
        to={path}
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
          Development preview. Map positions, detections, and node updates are
          simulated; hardware and retraining are not connected.
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
        {links(true)}
      </nav>
    </div>
  );
}
