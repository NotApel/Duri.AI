// src/services/api.js
const API_URL = "http://localhost:3000/api";

// ============ ALERTS ============
export const fetchAlerts = async () => {
  const response = await fetch(`${API_URL}/detections`);
  if (!response.ok) {
    throw new Error("Failed to fetch alerts");
  }
  return response.json();
};

// ============ STATS ============
export const fetchStats = async () => {
  const response = await fetch(`${API_URL}/analytics/stats`);
  if (!response.ok) {
    throw new Error("Failed to fetch stats");
  }
  return response.json();
};

// ============ HEALTH ============
export const fetchHealth = async () => {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error("Failed to check health");
  }
  return response.json();
};

// ============ AUTH ============
export const loginFarmer = async (email, password_hash) => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password_hash }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Login failed");
  }
  return response.json();
};

export const registerFarmer = async (farmerData) => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(farmerData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Registration failed");
  }
  return response.json();
};
