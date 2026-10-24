import { useEffect, useRef, useState } from "react";
import { FarmContext } from "../services/FarmContext";
import {
  emptyFarm,
  farmStorageKey,
  updateFarm,
  validateFarm,
} from "../services/farmSimulation";
import { useFarmList } from "../services/useFarmList";
export default function FarmProvider({ farmerId, children }) {
  const key = farmStorageKey(farmerId);
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return {
        state: raw ? validateFarm(JSON.parse(raw)) : emptyFarm(),
        error: "",
        raw,
      };
    } catch {
      return {
        state: emptyFarm(),
        error:
          "Saved simulation data could not be read. Allow browser storage or reset the farm simulation before saving.",
        raw: null,
      };
    }
  });
  const [state, setState] = useState(initial.state);
  const current = useRef(initial.state);
  const lastSaved = useRef(initial.raw);
  const [error, setError] = useState(initial.error);
  const blocked = useRef(Boolean(initial.error));
  const [revision, setRevision] = useState(0);
  const [mode, updateMode] = useState(() => {
    try {
      return sessionStorage.getItem(`${key}.mode`) === "backend"
        ? "backend"
        : "simulation";
    } catch {
      return "simulation";
    }
  });
  const [backendPlotId, setBackendPlotId] = useState(() => {
    try {
      return sessionStorage.getItem(`${key}.backend-plot`) || "";
    } catch {
      return "";
    }
  });
  function setMode(next) {
    if (!["simulation", "backend"].includes(next)) return;
    try {
      sessionStorage.setItem(`${key}.mode`, next);
    } catch {
      /* Preference is optional. */
    }
    updateMode(next);
  }
  const backendPlots = useFarmList("plots", farmerId, mode === "backend");
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const stored = (event) => {
      if (event.key !== key && event.key !== null) return;
      try {
        const raw = localStorage.getItem(key);
        const next = raw ? validateFarm(JSON.parse(raw)) : emptyFarm();
        current.current = next;
        lastSaved.current = raw;
        blocked.current = false;
        setState(next);
        setError("");
      } catch {
        blocked.current = true;
        setError(
          "The farm simulation changed in another tab and could not be read. Reload or reset before saving.",
        );
      }
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("storage", stored);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("storage", stored);
    };
  }, [key]);
  function dispatch(action) {
    try {
      if (blocked.current && action.type !== "reset")
        throw new Error(
          "Saved simulation data is unavailable. Allow browser storage or reset before saving.",
        );
      if (
        action.type !== "reset" &&
        localStorage.getItem(key) !== lastSaved.current
      )
        throw new Error(
          "The simulation changed in another tab. Reload before saving your changes.",
        );
      const next = validateFarm(
        action.type === "reset"
          ? emptyFarm()
          : updateFarm(current.current, action),
      );
      const raw = JSON.stringify(next);
      localStorage.setItem(key, raw);
      current.current = next;
      lastSaved.current = raw;
      blocked.current = false;
      setState(next);
      setError("");
      if (action.type === "reset") setRevision((value) => value + 1);
      return true;
    } catch (error) {
      setError(error.message);
      return false;
    }
  }
  const plots = mode === "simulation" ? state.plots : backendPlots.rows;
  const selectedPlotId =
    mode === "simulation"
      ? state.selectedPlotId
      : plots.some((p) => p.plot_id === backendPlotId)
        ? backendPlotId
        : "";
  function selectPlot(id) {
    if (mode === "simulation") return dispatch({ type: "selectPlot", id });
    try {
      sessionStorage.setItem(`${key}.backend-plot`, id);
    } catch {
      /* Selection works for this visit. */
    }
    setBackendPlotId(id);
  }
  return (
    <FarmContext.Provider
      value={{
        mode,
        setMode,
        state,
        dispatch,
        error,
        plots,
        selectedPlotId,
        selectPlot,
        backendPlots,
        farmerId,
        online,
        revision,
      }}
    >
      {children}
    </FarmContext.Provider>
  );
}
