import { useCallback, useEffect, useRef, useState } from "react";
import { readFarmList } from "./farmApi";
export function useFarmList(kind, id, enabled) {
  const key = enabled && id ? `${kind}:${id}` : "";
  const [result, setResult] = useState({
    key: "",
    rows: [],
    loading: false,
    loaded: false,
    error: "",
  });
  const active = useRef(null);
  const refresh = useCallback(async () => {
    active.current?.abort();
    if (!key) return;
    const controller = new AbortController();
    active.current = controller;
    setResult((previous) => ({
      key,
      rows: previous.key === key ? previous.rows : [],
      loading: true,
      loaded: previous.key === key && previous.loaded,
      error: "",
    }));
    try {
      const rows = await readFarmList(kind, id, { signal: controller.signal });
      if (!controller.signal.aborted)
        setResult({ key, rows, loading: false, loaded: true, error: "" });
    } catch (error) {
      if (!controller.signal.aborted)
        setResult((previous) => ({
          ...previous,
          loading: false,
          error: error.message,
        }));
    }
  }, [kind, id, key]);
  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => {
      clearTimeout(timer);
      active.current?.abort();
    };
  }, [refresh]);
  const current =
    key && result.key === key
      ? result
      : { rows: [], loading: Boolean(key), loaded: false, error: "" };
  return { ...current, refresh };
}
