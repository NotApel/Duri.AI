import { useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../services/AuthContext";
import { pushState, enablePush, disablePush } from "../services/pushClient";
export default function PushSettings() {
  const { farmer } = useContext(AuthContext);
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const pending = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const timer = setTimeout(refresh, 0);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, []);
  async function refresh() {
    try {
      const value = await pushState();
      if (mounted.current) {
        setState(value);
        setError("");
      }
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function change(enable) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const value = enable
        ? await enablePush(farmer.farmer_id)
        : await disablePush();
      if (mounted.current) setState(value);
    } catch (error) {
      if (mounted.current) {
        setError(error.message);
        if ("Notification" in window)
          setState((previous) =>
            previous
              ? { ...previous, permission: Notification.permission }
              : previous,
          );
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section
      className="ui-panel ui-form"
      aria-label="Harvest push notifications"
    >
      <h2>Harvest push notifications</h2>
      <p>
        Receive alerts for your confirmed harvest events on this browser.
        Notifications also remain available in Alerts.
      </p>
      {busy && <p role="status">Checking notification settings…</p>}
      {!busy && state?.supported === false && (
        <p className="ui-notice">
          This browser cannot receive push notifications here. Use HTTPS or
          localhost with Android Chrome or a supported desktop browser.
        </p>
      )}
      {!busy && state?.supported && (
        <p className="ui-notice" role="status">
          {!state.enabled
            ? "Push notifications are not configured on the backend."
            : state.permission === "denied"
              ? "Notifications are blocked. Allow notifications in your browser site settings."
              : state.subscribed
                ? "Harvest alerts are enabled for this account and browser."
                : "Harvest alerts are disabled for this account and browser."}
        </p>
      )}
      {error && (
        <p className="ui-notice ui-error" role="alert">
          {error}
        </p>
      )}
      <div className="ui-actions">
        <button
          className="ui-button primary"
          type="button"
          disabled={
            busy ||
            !state?.supported ||
            (!state?.enabled && !state?.subscribed) ||
            (state.permission === "denied" && !state?.subscribed)
          }
          onClick={() => change(!state.subscribed)}
        >
          {state?.subscribed
            ? "Disable harvest alerts"
            : "Enable harvest alerts"}
        </button>
        <button
          className="ui-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            refresh();
          }}
        >
          Refresh notification settings
        </button>
      </div>
    </section>
  );
}
