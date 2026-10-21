// Set VITE_API_URL for a deployed API. The default follows the browser hostname.
export const API_URL =
  import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000/api`;

export async function apiRequest(path, options = {}) {
  let response;
  const token = localStorage.getItem("token"); // Get JWT token for secure routes
  
  const headers = {
    ...options.headers,
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
      signal: AbortSignal.timeout(15000),
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

// ==========================================
// YOUR FRIEND'S AUTHENTICATION FUNCTIONS
// ==========================================
export const fetchAlerts = () => apiRequest("/detections");
export const fetchStats = () => apiRequest("/analytics/stats");
export const fetchHealth = () => apiRequest("/health");

export const loginFarmer = async (username, password) => {
  const data = await post("/auth/login", { username, password });
  if (data.token) localStorage.setItem("token", data.token); // Save Token
  return data;
};

export const registerFarmer = async (farmer) => {
  const data = await post("/auth/register", farmer);
  if (data.token) localStorage.setItem("token", data.token); // Save Token
  return data;
};

export const getSession = () => apiRequest("/auth/session");

export const logoutFarmer = () => {
  localStorage.removeItem("token");
  return post("/auth/logout", {});
};

export const clearFarmer = () => {
  localStorage.removeItem("token");
};

// ==========================================
// YOUR AI TRAINING FUNCTIONS
// ==========================================
export const fetchTraining = () => apiRequest("/analytics/training");
export const retrain = () => apiRequest("/analytics/retrain", { method: "POST" });