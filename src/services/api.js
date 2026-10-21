import { normalizeDetections } from "./detectionData";
import { normalizeTraining } from "./trainingData";
const configured = import.meta.env?.VITE_API_URL;
export const API_URL = (
  configured || `http://${window.location.hostname}:3000/api`
).replace(/\/$/, "");
// This feature branch still uses the legacy login/CORS contract. A returned
// farmer ID is attribution only; backend ownership checks remain required.
export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(API_URL + path, {
      ...options,
      credentials: "same-origin",
      signal: options.signal || AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Unable to reach the backend. Please check your connection and try again.",
      { cause: error },
    );
  }
  const body = await response.json().catch(() => {
    throw new Error("The backend returned an invalid response.");
  });
  if (!response.ok) {
    const error = new Error(
      body.error || `Request failed (${response.status}). Please try again.`,
    );
    error.status = response.status;
    throw error;
  }
  return body;
}
export const fetchAlerts = async (options) =>
  normalizeDetections(await apiRequest("/detections", options));
export const fetchStats = () => apiRequest("/analytics/stats");
export const fetchHealth = () => apiRequest("/health");
export const fetchTraining = async (options) =>
  normalizeTraining(await apiRequest("/analytics/training", options));
export const retrain = () =>
  apiRequest("/analytics/retrain", { method: "POST" });
const post = (path, body) =>
  apiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const PROFILE_KEY = "duriai.backend-farmer";
export const clearFarmer = () => {
  try {
    sessionStorage.removeItem(PROFILE_KEY);
  } catch {
    /* No profile was persisted. */
  }
};
export async function loginFarmer(email, password_hash) {
  clearFarmer();
  const result = await post("/auth/login", { email, password_hash });
  if (!result.farmer || !/^\d+$/.test(String(result.farmer.farmer_id)))
    throw new Error("The backend did not return a farmer identity.");
  try {
    sessionStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ farmer_id: result.farmer.farmer_id }),
    );
  } catch {
    throw new Error(
      "Allow session storage to use feedback, then log in again.",
    );
  }
  return result;
}
export const registerFarmer = (farmer) => post("/auth/register", farmer);
export async function getCurrentFarmer() {
  let farmer;
  try {
    farmer = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || "null");
  } catch {
    throw new Error("Please log in before submitting feedback.");
  }
  if (!farmer || !/^\d+$/.test(String(farmer.farmer_id)))
    throw new Error("Please log in before submitting feedback.");
  return farmer;
}
