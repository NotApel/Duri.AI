// Set VITE_API_URL for a deployed API. The default follows the browser hostname.
export const API_URL = (
  import.meta.env?.VITE_API_URL || `http://${window.location.hostname}:3000/api`
).replace(/\/$/, "");

function readToken() {
  try {
    return localStorage.getItem("token");
  } catch {
    throw new Error(
      "Browser storage is unavailable. Allow storage before logging in.",
    );
  }
}

function clearCredentials() {
  localStorage.removeItem("token");
  localStorage.removeItem("farmer");
}

export async function apiRequest(path, options = {}) {
  const publicAuth = [
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].includes(path);

  const headers = new Headers(options.headers);
  const token = publicAuth ? null : readToken();

  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
      signal: options.signal || AbortSignal.timeout(180000),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Unable to reach the server. Please check your connection and try again.",
      { cause: error },
    );
  }

  const body =
    response.status === 204
      ? null
      : await response.json().catch(() => {
          if (response.ok)
            throw new Error("The server returned an invalid response.");
          return {};
        });

  if (!response.ok) {
    if (
      response.status === 401 &&
      (path === "/auth/session" || !path.startsWith("/auth/"))
    ) {
      try {
        clearCredentials();
      } catch {
        /* The server has already rejected this token. */
      }
      window.dispatchEvent(new Event("duriai:unauthorized"));
    }
    const error = new Error(
      body?.error || "The request could not be completed. Please try again.",
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
// AUTHENTICATION FUNCTIONS
// ==========================================
export const fetchAlerts = () => apiRequest("/detections");
export const fetchStats = () => apiRequest("/analytics/stats");
export const fetchHealth = () => apiRequest("/health");

export async function loginFarmer(username, password) {
  const response = await post("/auth/login", { username, password });
  if (
    typeof response?.token !== "string" ||
    !response.token ||
    !/^\d+$/.test(String(response.farmer?.farmer_id))
  )
    throw new Error(
      "The server did not return a valid login. Please try again.",
    );
  try {
    localStorage.setItem("token", response.token);
    localStorage.setItem("farmer", JSON.stringify(response.farmer));
  } catch {
    try {
      clearCredentials();
    } catch {
      /* Storage is blocked. */
    }
    throw new Error(
      "Unable to store your login. Allow browser storage and try again.",
    );
  }
  return response;
}

export const registerFarmer = (farmer) => post("/auth/register", farmer);

export async function getSession() {
  if (!readToken()) return { farmer: null };
  const response = await apiRequest("/auth/session");
  if (!/^\d+$/.test(String(response?.farmer?.farmer_id)))
    throw new Error(
      "The server returned an invalid session. Please try again.",
    );
  return response;
}

export async function logoutFarmer() {
  if (readToken()) {
    try {
      await post("/auth/logout", {});
    } catch (error) {
      if (error.status !== 401) throw error;
    }
  }
  clearCredentials();
}

// ==========================================
// AI TRAINING FUNCTIONS (Damia's Code)
// ==========================================
export const fetchTraining = () => apiRequest("/analytics/training");
export const retrain = () =>
  apiRequest("/analytics/retrain", { method: "POST" });

export const getCurrentFarmer = async () => {
  try {
    const session = await apiRequest("/auth/session");
    return { farmer_id: session.farmer_id || session.farmer?.farmer_id };
  } catch (err) {
    console.error("Failed to get current farmer:", err);
    return { farmer_id: null };
  }
};

export const clearFarmer = () => {
  clearCredentials();
};
