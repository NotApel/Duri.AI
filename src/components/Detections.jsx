import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import DetectionDetails from "./DetectionDetails";
import { useDetections } from "../services/DetectionContext";
import "./Detections.css";

const statuses = {
  PENDING: "Candidate",
  VERIFYING: "Verifying",
  VERIFIED: "Verified · backend status",
  REJECTED: "Rejected",
  FAILED: "Failed / unknown",
  UNKNOWN: "Unknown status",
};
const date = (value) =>
  new Date(value).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  });
function Badge({ status }) {
  return (
    <span className={`d-status d-${status.toLowerCase()}`}>
      {statuses[status] || statuses.UNKNOWN}
    </span>
  );
}

export default function Detections({ mode = "map" }) {
  const { eventId } = useParams();
  const {
    events,
    receipts,
    loading,
    error: loadError,
    refresh: load,
    recordFeedback,
    receiptWarning,
    loaded,
  } = useDetections();
  const records = Object.fromEntries(
    events
      .filter((item) => receipts[item.id]?.eventTime === item.time)
      .map((item) => [item.id, receipts[item.id]]),
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [view, setView] = useState(mode === "history" ? "all" : "needs");
  const [query, setQuery] = useState("");
  const basePath = mode === "history" ? "/analytics" : "/map";
  const [status, setStatus] = useState("");
  const [node, setNode] = useState("");
  const [day, setDay] = useState("");
  const heading = useRef(null);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [eventId]);
  const event = events.find((item) => item.id === eventId);
  const filtered = events.filter(
    (item) =>
      (view === "all" ||
        (view === "reviewed" ? records[item.id] : !records[item.id])) &&
      (!query ||
        `${item.id} ${item.node} ${records[item.id]?.comment || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!status || item.status === status) &&
      (!node || item.node === node) &&
      (!day ||
        new Date(item.time).toLocaleDateString("en-CA", {
          timeZone: "Asia/Kuala_Lumpur",
        }) === day),
  );
  return (
    <section className="detections">
      <div className="d-demo">
        <div>
          <strong>Backend records</strong>
          <span>
            Latest records returned by the API · hardware operation and model
            training remain unverified
          </span>
        </div>
      </div>
      {!online && (
        <p className="d-notice" role="status">
          You’re offline. Displayed backend records may be stale. Feedback
          requires a connection.
        </p>
      )}
      <header className="d-heading">
        <div>
          <h2 className="d-page-title" ref={heading} tabIndex={-1}>
            {eventId
              ? "Detection details"
              : mode === "history"
                ? "Detection history"
                : "Current detections"}
          </h2>
        </div>
      </header>
      {receiptWarning && (
        <p className="d-notice" role="status">
          {receiptWarning}
        </p>
      )}
      {loaded && loadError && (
        <p className="d-error" role="alert">
          {loadError} Displayed records may be stale.{" "}
          <button onClick={load}>Try again</button>
        </p>
      )}
      {loading && loaded && (
        <p role="status" className="d-notice">
          Refreshing backend records…
        </p>
      )}
      {loading && !loaded ? (
        <p className="d-empty" role="status">
          Loading backend detections…
        </p>
      ) : loadError && !loaded ? (
        <div className="d-empty" role="alert">
          <h2>Unable to load detections</h2>
          <p>{loadError}</p>
          <button onClick={load}>
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      ) : eventId ? (
        event ? (
          <DetectionDetails
            key={event.id}
            event={event}
            receipt={records[event.id]}
            onSave={recordFeedback}
            online={online}
            available={!loading && !loadError}
            StatusBadge={Badge}
          />
        ) : (
          <div className="d-empty">
            <h2>Event unavailable</h2>
            <p>
              This event is not among the latest records returned by the
              backend. Refresh or return to Harvest Logs.
            </p>
            <button onClick={load}>Refresh events</button>
            <Link to={basePath}>
              Return to {mode === "history" ? "harvest logs" : "orchard map"}
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="d-summary">
            <strong>{events.filter((item) => !records[item.id]).length}</strong>
            <span>events without a feedback receipt in this session</span>
          </div>
          <button className="ui-button" disabled={loading} onClick={load}>
            Refresh events
          </button>
          {mode === "history" ? (
            <div className="d-tabs" role="group" aria-label="Review filter">
              {[
                ["needs", "Needs review"],
                ["all", "All events"],
                ["reviewed", "Reviewed history"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <Link className="d-back" to="/analytics">
              View events in Harvest Logs <ArrowUpRight size={18} />
            </Link>
          )}
          <div className="d-filters">
            {mode === "history" && (
              <label>
                Search logs
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Event, node or field note"
                />
              </label>
            )}
            <label>
              System status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {Object.entries(statuses).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sensor node
              <select value={node} onChange={(e) => setNode(e.target.value)}>
                <option value="">All nodes</option>
                {[...new Set(events.map((item) => item.node))].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Event date (MYT)
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <button
              onClick={() => {
                setStatus("");
                setNode("");
                setDay("");
                setQuery("");
              }}
            >
              Clear filters
            </button>
          </div>
          <p className="d-caption" aria-live="polite">
            {filtered.length} events · timestamps in Malaysia time · backend
            records
          </p>
          <div className="d-list">
            {filtered.map((item) => (
              <Link
                className="d-event"
                key={item.id}
                to={`${basePath}/events/${item.id}`}
              >
                <div className="d-event-body">
                  <div className="d-event-top">
                    <span className="d-event-id">Event #{item.id}</span>
                    <Badge status={item.status} />
                  </div>
                  <h2>
                    {item.prediction
                      ? `${item.prediction} · reported prediction`
                      : "Detection awaiting assessment"}
                  </h2>
                  <p>
                    {item.node} · {date(item.time)}
                  </p>
                  <p className="d-caption">
                    {records[item.id]
                      ? records[item.id].label === "DURIAN"
                        ? "Farmer assessment: Durian"
                        : "Farmer assessment: No Durian"
                      : "Awaiting farmer review"}{" "}
                    · Location unavailable
                  </p>
                </div>
                <ArrowUpRight
                  className="d-event-arrow"
                  aria-label="View event"
                />
              </Link>
            ))}
          </div>
          {!filtered.length && (
            <div className="d-empty">
              <h2>No events in this view</h2>
              <p>
                Try another filter or open Harvest Logs. The API currently
                returns up to ten recent records.
              </p>
              <button
                onClick={() => {
                  setView(mode === "history" ? "all" : "needs");
                  setStatus("");
                  setNode("");
                  setDay("");
                  setQuery("");
                }}
              >
                Clear event filters
              </button>
              {mode === "map" && (
                <p>
                  <Link to="/analytics">
                    Open Harvest Logs for reviewed events
                  </Link>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
