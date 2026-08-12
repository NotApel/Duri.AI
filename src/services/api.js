// src/services/api.js

const API_URL = "http://localhost:3000/api";

export const fetchAlerts = async () => {
  const response = await fetch(`${API_URL}/alerts/mock`);
  if (!response.ok) {
    throw new Error("Failed to fetch alerts");
  }
  return response.json();
};

export const fetchStats = async () => {
  const response = await fetch(`${API_URL}/analytics/stats`);
  if (!response.ok) {
    throw new Error("Failed to fetch stats");
  }
  return response.json();
};

export const fetchHealth = async () => {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error("Failed to check health");
  }
  return response.json();
};
