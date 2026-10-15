// src/services/api.js
const API_URL = import.meta.env.VITE_API_URL || "/api";

async function request(path, options) {
  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

// ============ ALERTS ============
export const fetchAlerts = () => request("/detections");
export const fetchNodes = (plotId) => request(`/plots/${encodeURIComponent(plotId)}/nodes`);

// ============ STATS ============
export const fetchStats = () => request("/analytics/stats");

// ============ HEALTH ============
export const fetchHealth = () => request("/health");

// ============ AUTH ============
export const loginFarmer = (email, password_hash) =>
  request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password_hash }),
  });

export const registerFarmer = (farmerData) =>
  request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(farmerData),
  });
