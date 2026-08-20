// src/components/AppLayout.jsx
import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";

export default function AppLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white p-4 min-h-screen flex flex-col">
        <h1 className="text-xl font-bold mb-6">🌳 DURI.AI</h1>

        <nav className="flex-1 space-y-1">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `block px-4 py-2 rounded hover:bg-slate-700 transition ${isActive ? "bg-slate-700" : ""}`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/map"
            className={({ isActive }) =>
              `block px-4 py-2 rounded hover:bg-slate-700 transition ${isActive ? "bg-slate-700" : ""}`
            }
          >
            Orchard Map
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `block px-4 py-2 rounded hover:bg-slate-700 transition ${isActive ? "bg-slate-700" : ""}`
            }
          >
            Analytics
          </NavLink>
          <NavLink
            to="/nodes"
            className={({ isActive }) =>
              `block px-4 py-2 rounded hover:bg-slate-700 transition ${isActive ? "bg-slate-700" : ""}`
            }
          >
            Node Status
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `block px-4 py-2 rounded hover:bg-slate-700 transition ${isActive ? "bg-slate-700" : ""}`
            }
          >
            Settings
          </NavLink>
        </nav>

        {/* Logout Button at Bottom */}
        <div className="mt-auto pt-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full block px-4 py-2 rounded hover:bg-red-600/20 text-red-400 transition text-left"
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
