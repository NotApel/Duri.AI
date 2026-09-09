import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  ClipboardList, 
  Map, 
  Hexagon, 
  Settings, 
  LogOut 
} from "lucide-react";

export default function AppLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/login");
  };

  return (
    /* MAIN BACKGROUND (bg-yellow-100) */
    <div className="flex flex-col md:flex-row min-h-screen bg-yellow-100 text-slate-100 font-sans">
      
      {/* DESKTOP SIDEBAR BACKGROUND (bg-linear-to-tl from-green-900 to-green-600) */}
      <aside className="hidden md:flex flex-col w-64 bg-linear-to-tl from-green-900 to-green-600 border-r border-emerald-800/30 p-4 min-h-screen sticky top-0 h-screen">
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
        </div>
      </aside>

      {/* MOBILE TOP HEADER BACKGROUND (bg-green-700) */}
      <header className="md:hidden bg-green-700 px-5 py-3 flex justify-between items-center border-b border-emerald-900/30 sticky top-0 z-40 shadow-md">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🌳</span>
          <span className="text-lg font-bold text-emerald-100 tracking-wide">DURI.AI</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-rose-400 hover:text-rose-300 px-2 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      {/* MOBILE BOTTOM NAV BACKGROUND (bg-emerald-950/95) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-emerald-950/95 backdrop-blur-md border-t border-emerald-900/40 flex justify-around items-center py-2 px-1 z-50 shadow-lg">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[10px] transition px-2 py-1 ${
              isActive ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`
          }
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Dashboard</span>
        </NavLink>
        <NavLink
          to="/map"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[10px] transition px-2 py-1 ${
              isActive ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`
          }
        >
          <Map className="w-5 h-5" />
          <span>Map</span>
        </NavLink>
        <NavLink
          to="/analytics"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[10px] transition px-2 py-1 ${
              isActive ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`
          }
        >
          <ClipboardList className="w-5 h-5" />
          <span>Analytics</span>
        </NavLink>
        <NavLink
          to="/nodes"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[10px] transition px-2 py-1 ${
              isActive ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`
          }
        >
          <Hexagon className="w-5 h-5" />
          <span>Nodes</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[10px] transition px-2 py-1 ${
              isActive ? "text-emerald-400 font-bold" : "text-slate-400 hover:text-slate-200"
            }`
          }
        >
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </NavLink>
      </nav>

    </div>
  );
}