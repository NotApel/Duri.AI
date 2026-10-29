import { useCallback, useEffect, useState } from "react";
import { fetchDetection } from "./detectionApi";
export function useDetectionRecord(eventId) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    id: null,
    event: null,
    error: "",
    loading: false,
  });
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((previous) => ({
        id: eventId,
        event: previous.id === eventId ? previous.event : null,
        error: "",
        loading: true,
      }));
      try {
        const event = await fetchDetection(eventId, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          setState({ id: eventId, event, error: "", loading: false });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            error: error.message,
            loading: false,
          }));
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [eventId, attempt]);
  return {
    ...(state.id === eventId
      ? state
      : { event: null, error: "", loading: Boolean(eventId) }),
    refresh,
  };
}
