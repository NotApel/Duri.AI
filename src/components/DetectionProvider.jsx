import { useCallback, useEffect, useRef, useState } from "react";
import { DetectionContext } from "../services/DetectionContext";
import { fetchDetectionPage } from "../services/detectionApi";
import { readReceipts, writeReceipts } from "../services/feedbackReceipts";
export default function DetectionProvider({ farmerId, children }) {
  const [result, setResult] = useState({
    events: [],
    loading: true,
    error: "",
    loaded: false,
    nextCursor: null,
    moreLoading: false,
  });
  const [receipts, setReceipts] = useState(() => {
    try {
      return readReceipts(farmerId, window.sessionStorage);
    } catch {
      return {};
    }
  });
  const receiptsRef = useRef(receipts);
  const [receiptWarning, setReceiptWarning] = useState("");
  const active = useRef(null);
  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setResult((previous) => ({
      ...previous,
      loading: true,
      moreLoading: false,
      error: "",
    }));
    try {
      const page = await fetchDetectionPage({ signal: controller.signal });
      if (!controller.signal.aborted)
        setResult({
          ...page,
          loading: false,
          moreLoading: false,
          error: "",
          loaded: true,
        });
    } catch (error) {
      if (!controller.signal.aborted)
        setResult((previous) => ({
          ...previous,
          loading: false,
          error: error.message,
        }));
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => {
      clearTimeout(timer);
      active.current?.abort();
    };
  }, [refresh]);
  const resultRef = useRef(result);
  resultRef.current = result;
  async function loadMore() {
    const current = resultRef.current;
    if (!current.nextCursor || current.loading || current.moreLoading) return;
    const controller = new AbortController();
    active.current?.abort();
    active.current = controller;
    setResult((previous) => ({ ...previous, moreLoading: true, error: "" }));
    try {
      const page = await fetchDetectionPage({
        cursor: current.nextCursor,
        signal: controller.signal,
      });
      if (!controller.signal.aborted)
        setResult((previous) => {
          const ids = new Set(previous.events.map((event) => event.id));
          return {
            ...previous,
            events: [
              ...previous.events,
              ...page.events.filter((event) => !ids.has(event.id)),
            ],
            nextCursor: page.nextCursor,
            moreLoading: false,
          };
        });
    } catch (error) {
      if (!controller.signal.aborted)
        setResult((previous) => ({
          ...previous,
          moreLoading: false,
          error: error.message,
        }));
    }
  }
  function recordFeedback(eventId, receipt) {
    const next = { ...receiptsRef.current, [eventId]: receipt };
    receiptsRef.current = next;
    setReceipts(next);
    let persisted = false;
    try {
      persisted = writeReceipts(farmerId, next, window.sessionStorage);
    } catch {
      /* Keep the acknowledged receipt in memory. */
    }
    if (!persisted)
      setReceiptWarning(
        "Your feedback was accepted, but this browser could not retain its confirmation after a reload. Check the event before submitting again.",
      );
    // Reload the server-reported status; never rewrite its prediction locally.
    refresh();
  }
  return (
    <DetectionContext.Provider
      value={{
        ...result,
        refresh,
        loadMore,
        receipts,
        recordFeedback,
        receiptWarning,
      }}
    >
      {children}
    </DetectionContext.Provider>
  );
}
