// Set VITE_API_URL for a deployed API. The default follows the browser hostname.
export const API_URL =
  import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000/api`;
export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: "include",
      signal: AbortSignal.timeout(15000),
      ...options,
    });
  } catch {
    throw new Error(
      "Unable to reach the server. Please check your connection and try again.",
    );
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("duriai:unauthorized"));
    const error = new Error(
      body.error || "The request could not be completed. Please try again.",
    );
    error.status = response.status;
    throw error;
  }
  return body;
}
const post = (path, body) =>
  apiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const fetchAlerts = () => apiRequest("/detections");
export const fetchStats = () => apiRequest("/analytics/stats");
export const fetchHealth = () => apiRequest("/health");
export const loginFarmer = async (username, password) => {
  const response = await post("/auth/login", { username, password });
  if (response.token) {
    localStorage.setItem("token", response.token);
    localStorage.setItem("farmer", JSON.stringify(response.farmer));
  }
  return response;
};
export const registerFarmer = (farmer) => post("/auth/register", farmer);
export const getSession = () => apiRequest("/auth/session");
export const logoutFarmer = () => post("/auth/logout", {});
