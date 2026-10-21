import { useCallback, useEffect, useRef, useState } from "react";
import { AuthContext } from "../services/AuthContext";
import { getSession, loginFarmer, logoutFarmer } from "../services/api";

export default function AuthProvider({ children }) {
  const [farmer, setFarmer] = useState(null);
  const [signedOut, setSignedOut] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  // Ignore checks started before a login/logout completed.
  const revision = useRef(0);
  const invalidate = useCallback(() => {
    revision.current += 1;
  }, []);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const result = await getSession();
      if (current === revision.current) {
        setFarmer(result.farmer);
        setSessionError("");
      }
    } catch (error) {
      if (current === revision.current) {
        if (error.status === 401) {
          setFarmer(null);
          setSessionError("");
        } else setSessionError(error.message);
      }
    } finally {
      if (current === revision.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    const expire = () => {
      ++revision.current;
      setFarmer(null);
      setSessionError("");
      setChecking(false);
    };
    const onFocus = () => {
      refresh();
    };
    const onStorage = (event) => {
      if (event.key === "token" || event.key === null) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("duriai:unauthorized", expire);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => {
      clearTimeout(timer);
      invalidate();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("duriai:unauthorized", expire);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [refresh, invalidate]);
  async function login(username, password) {
    const result = await loginFarmer(username, password);
    ++revision.current;
    setSignedOut(false);
    setFarmer(result.farmer);
    setSessionError("");
    setChecking(false);
    return result;
  }
  async function logout() {
    await logoutFarmer();
    ++revision.current;
    setSignedOut(true);
    setFarmer(null);
    setSessionError("");
    setChecking(false);
  }
  return (
    <AuthContext.Provider
      value={{
        farmer,
        signedOut,
        checking,
        sessionError,
        refresh,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
