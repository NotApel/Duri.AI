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
    /* MAIN BACKGROUND (bg-yellow-100) */
    <div className="flex flex-col md:flex-row min-h-screen bg-yellow-100 text-slate-100 font-sans">
      
      {/* DESKTOP SIDEBAR */}
      <aside className="shadow-md hidden md:flex flex-col w-64 bg-green-700 border-r border-emerald-800/30 p-4 min-h-screen sticky top-0 h-screen">
        <div className="flex items-center space-x-2 mb-6 px-2">
          <span className="text-2xl">🌳</span>
          <span className="text-xl font-bold tracking-wider text-neutral-100">DURI.AI</span>
        </div>

        <nav className="flex-1 space-y-1">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition font-medium text-sm ${
                isActive ? "bg-emerald-600 text-white font-semibold shadow-lg" : "text-slate-300 hover:bg-emerald-900/40"
              }`
            }
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </NavLink>
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition font-medium text-sm ${
                isActive ? "bg-emerald-600 text-white font-semibold shadow-lg" : "text-slate-300 hover:bg-emerald-900/40"
              }`
            }
          >
            <Map className="w-5 h-5" />
            Orchard Map
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition font-medium text-sm ${
                isActive ? "bg-emerald-600 text-white font-semibold shadow-lg" : "text-slate-300 hover:bg-emerald-900/40"
              }`
            }
          >
            <ClipboardList className="w-5 h-5" />
            Analytics
          </NavLink>
          <NavLink
            to="/nodes"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition font-medium text-sm ${
                isActive ? "bg-emerald-600 text-white font-semibold shadow-lg" : "text-slate-300 hover:bg-emerald-900/40"
              }`
            }
          >
            <Hexagon className="w-5 h-5" />
            Node Status
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg transition font-medium text-sm ${
                isActive ? "bg-emerald-600 text-white font-semibold shadow-lg" : "text-slate-300 hover:bg-emerald-900/40"
              }`
            }
          >
            <Settings className="w-5 h-5" />
            Settings
          </NavLink>
        </nav>

        <div className="mt-auto pt-4 border-t border-emerald-800/30">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-rose-950/40 text-rose-400 border border-rose-900/30 transition text-left text-sm font-medium"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
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
