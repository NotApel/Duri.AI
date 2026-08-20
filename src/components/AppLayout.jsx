// src/components/AppLayout.jsx
import React from "react";
import { Outlet, NavLink } from "react-router-dom";

export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white p-4 min-h-screen">
        <h1 className="text-xl font-bold mb-6">🌳 DURI.AI</h1>
        <nav className="space-y-1">
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
      </div>

      {/* Main Content - THIS IS WHERE PAGES RENDER */}
      <div className="flex-1 p-6 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
