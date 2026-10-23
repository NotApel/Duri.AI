import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFarm } from "../services/FarmContext";
import { useFarmList } from "../services/useFarmList";
import { markBackendRead } from "../services/farmApi";
import { farmDate } from "../services/farmData";
import { FarmListState } from "./FarmControls";
export default function Notifications() {
  const { mode, state, dispatch, farmerId, online } = useFarm();
  const backend = useFarmList("notifications", farmerId, mode === "backend");
  const [acknowledged, setAcknowledged] = useState({});
  const rows =
    mode === "simulation"
      ? state.notifications
      : backend.rows.map((row) => ({
          ...row,
          is_read:
            row.is_read ||
            acknowledged[row.notification_id]?.created_at === row.created_at,
        }));
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const heading = useRef(null);
  const selected = rows.find((row) => row.notification_id === selectedId);
  const visible = rows.filter(
    (row) =>
      filter === "all" || (filter === "read" ? row.is_read : !row.is_read),
  );
  async function markRead() {
    if (!selected || selected.is_read || pending.current) return;
    setError("");
    if (mode === "simulation") {
      if (dispatch({ type: "markRead", id: selected.notification_id }))
        setMessage("Notification marked as read in this browser simulation.");
      return;
    }
    if (!online || backend.loading || backend.error) return;
    pending.current = true;
    setSaving(true);
    try {
      const receipt = await markBackendRead(selected.notification_id, farmerId);
      setAcknowledged((previous) => ({
        ...previous,
        [receipt.notification_id]: receipt,
      }));
      setMessage("Notification marked as read by the backend.");
      backend.refresh();
    } catch (error) {
      setError(error.message);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <div className="farm-toolbar">
        <label className="ui-field" htmlFor="notification-filter">
          Show notifications
          <select
            id="notification-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All notifications</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </select>
        </label>
        {mode === "backend" && (
          <button
            className="ui-button"
            disabled={backend.loading}
            onClick={backend.refresh}
          >
            Refresh notifications
          </button>
        )}
      </div>
      <p className="ui-muted">
        {rows.filter((row) => !row.is_read).length} unread in{" "}
        {mode === "simulation"
          ? "this browser simulation"
          : "the returned API records"}
        . Opening a notification does not mark it read. Browser push delivery is
        not connected.
      </p>
      {mode === "backend" && (
        <FarmListState resource={backend} noun="notifications" />
      )}
      {mode === "backend" && !online && (
        <p className="ui-notice" role="status">
          You’re offline. Displayed notifications may be stale; read updates
          require a connection.
        </p>
      )}
      {message && (
        <p className="ui-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="ui-notice ui-error" role="alert">
          {error}
        </p>
      )}
      <div className="farm-grid">
        <section className="ui-panel">
          <h2>Notifications</h2>
          <ul className="farm-record-list">
            {visible.map((row) => (
              <li key={row.notification_id}>
                <button
                  className="ui-text-link"
                  aria-pressed={selectedId === row.notification_id}
                  onClick={() => {
                    setSelectedId(row.notification_id);
                    setError("");
                    setMessage("");
                    requestAnimationFrame(() => heading.current?.focus());
                  }}
                >
                  {row.title}
                </button>
                <p>
                  {row.is_read ? "Read" : "Unread"} · {farmDate(row.created_at)}
                </p>
              </li>
            ))}
          </ul>
          {!visible.length &&
            (mode === "simulation" || (backend.loaded && !backend.error)) && (
              <p role="status">
                {filter === "unread"
                  ? "No unread notifications."
                  : filter === "read"
                    ? "No read notifications."
                    : "No notifications available."}
              </p>
            )}
          {mode === "simulation" && !rows.length && (
            <p>
              <Link className="ui-text-link" to="/nodes">
                Register a node and simulate a candidate event
              </Link>
            </p>
          )}
        </section>
        {selected ? (
          <section className="ui-panel">
            <h2 ref={heading} tabIndex={-1}>
              {selected.title}
            </h2>
            <p>{selected.message_noti}</p>
            <dl className="farm-facts">
              <div>
                <dt>Time · MYT</dt>
                <dd>{farmDate(selected.created_at)}</dd>
              </div>
              <div>
                <dt>Read state</dt>
                <dd>{selected.is_read ? "Read" : "Unread"}</dd>
              </div>
            </dl>
            {selected.detection_id ? (
              <p>
                <Link
                  className="ui-text-link"
                  to={
                    mode === "simulation"
                      ? `/map/simulation/events/${encodeURIComponent(selected.detection_id)}`
                      : `/map/events/${encodeURIComponent(selected.detection_id)}`
                  }
                >
                  View detection details
                </Link>
              </p>
            ) : (
              <p>No valid detection link was supplied.</p>
            )}
            <div className="ui-actions">
              <button
                className="ui-button primary"
                disabled={
                  saving ||
                  selected.is_read ||
                  (mode === "backend" &&
                    (!online || backend.loading || Boolean(backend.error)))
                }
                onClick={markRead}
              >
                {saving
                  ? "Saving…"
                  : selected.is_read
                    ? "Already read"
                    : "Mark as read"}
              </button>
              <button className="ui-button" onClick={() => setSelectedId("")}>
                Close notification
              </button>
            </div>
          </section>
        ) : (
          <p className="farm-empty">
            Select a notification to view its details.
          </p>
        )}
      </div>
    </>
  );
}
