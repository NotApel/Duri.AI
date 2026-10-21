import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Camera, RefreshCw } from "lucide-react";
import "./Detections.css";
import { fetchAlerts, apiRequest, getCurrentFarmer } from "../services/api";

const statuses = {
  PENDING: "Candidate",
  VERIFYING: "Verifying",
  VERIFIED: "Verified · backend status",
  REJECTED: "Rejected",
  FAILED: "Failed / unknown",
};

const date = (value) =>
  new Date(value).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  });

// Keep local labels for UI consistency
const categories = ["Wind", "Animal", "Human Activity", "Other"];
const feedbackLabels = {
  confirmed: "Confirmed durian",
  rejected: "Marked as false alarm",
  unsure: "Unsure",
};

function saveLocalFeedback(records, id, label, category, comment) {
  return {
    ...records,
    [id]: { label, category, comment, savedAt: new Date().toISOString() },
  };
}

function Badge({ status }) {
  return (
    <span className={`d-status d-${status.toLowerCase()}`}>
      {statuses[status] || status}
    </span>
  );
}

export default function Detections({ mode = "map" }) {
  const { eventId } = useParams();
  const [events, setEvents] = useState([]); // Real backend data
  const [records, setRecords] = useState({}); // Local UI tracking
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [view, setView] = useState(mode === "history" ? "all" : "needs");
  const [query, setQuery] = useState("");
  const basePath = mode === "history" ? "/analytics" : "/map";
  const [status, setStatus] = useState("");
  const [node, setNode] = useState("");
  const [day, setDay] = useState("");
  const heading = useRef(null);

  const loadRevision = useRef(0);
  async function load(signal) {
    const revision = ++loadRevision.current;
    setLoading(true);
    try {
      const data = await fetchAlerts({ signal });
      if (revision === loadRevision.current) {
        setEvents(data);
        setLoadError("");
      }
    } catch (err) {
      if (err.name !== "AbortError" && revision === loadRevision.current)
        setLoadError(err.message);
    } finally {
      if (!signal?.aborted && revision === loadRevision.current)
        setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), 0);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      clearTimeout(timer);
      controller.abort();
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
        (view === "reviewed"
          ? ["VERIFIED", "REJECTED"].includes(item.status)
          : !["VERIFIED", "REJECTED"].includes(item.status))) &&
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
            Detection records from the API · hardware and training execution are
            not verified by this screen
          </span>
        </div>
      </div>
      {!online && (
        <p className="d-notice" role="status">
          You’re offline. Any displayed records may be stale; feedback requires
          a connection.
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

      {loading ? (
        <p className="d-empty" role="status">
          Loading real detections from database…
        </p>
      ) : loadError ? (
        <div className="d-empty" role="alert">
          <h2>Backend connection failed</h2>
          <p>{loadError}</p>
          <button onClick={load}>
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      ) : eventId ? (
        event ? (
          <EventDetails
            key={event.id}
            event={event}
            records={records}
            onSave={setRecords}
            basePath={basePath}
            onRefresh={(id, newStatus) =>
              setEvents((current) =>
                current.map((item) =>
                  item.id === id ? { ...item, status: newStatus } : item,
                ),
              )
            }
          />
        ) : (
          <div className="d-empty">
            <h2>Event not found</h2>
            <Link to={basePath}>Return to list</Link>
          </div>
        )
      ) : (
        <>
          <div className="d-summary">
            <strong>
              {
                events.filter(
                  (item) => !["VERIFIED", "REJECTED"].includes(item.status),
                ).length
              }
            </strong>
            <span>events awaiting your review</span>
          </div>
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
              View all events in Harvest Logs <ArrowUpRight size={18} />
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
                  placeholder="Event, node or note"
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
            {filtered.length} events · records returned by the backend
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
                    {item.status === "VERIFIED"
                      ? "Durian detected by AI"
                      : item.status === "REJECTED"
                        ? "Non-durian event"
                        : "Possible durian fall"}
                  </h2>
                  <p>
                    {item.node} · {date(item.time)}
                  </p>
                  <p className="d-caption">
                    {records[item.id]
                      ? feedbackLabels[records[item.id].label]
                      : ["VERIFIED", "REJECTED"].includes(item.status)
                        ? "Backend reports this event as reviewed"
                        : "Awaiting farmer review"}
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
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EventDetails({ event, records, onSave, basePath, onRefresh }) {
  const previous = records[event.id];
  const [label, setLabel] = useState(previous?.label || "");
  const [category, setCategory] = useState(previous?.category || "");
  const [comment, setComment] = useState(previous?.comment || "");
  const [file, setFile] = useState(null); // For uploading image
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Helper to convert file to base64
  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });

  async function submit(e) {
    e.preventDefault();
    if (pending.current || saved) return;
    if (!["confirmed", "rejected"].includes(label)) {
      setError("Choose a classification.");
      return;
    }
    if (label === "rejected" && !category) {
      setError("Please select a false-alarm category.");
      return;
    }
    if (
      file &&
      (!["image/jpeg", "image/png"].includes(file.type) ||
        file.size > 5 * 1024 * 1024)
    ) {
      setError("Choose a JPEG or PNG image no larger than 5 MB.");
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const farmer = await getCurrentFarmer();
      const image = file ? await toBase64(file) : null;
      const categoryMap = { Wind: 1, Animal: 2, "Human Activity": 3, Other: 4 }; // Existing database/data.sql seed contract.
      await apiRequest(`/detections/${event.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farmer_id: farmer.farmer_id,
          category_id: label === "rejected" ? categoryMap[category] : null,
          correct_detection: label === "confirmed",
          comment_farmer: comment,
          image_base64: image,
        }),
      });
      if (mounted.current) {
        onSave(saveLocalFeedback(records, event.id, label, category, comment));
        setSaved(true);
        onRefresh?.(event.id, label === "confirmed" ? "VERIFIED" : "REJECTED");
      }
    } catch (err) {
      if (mounted.current) setError(err.message);
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <>
      <Link className="d-back" to={basePath}>
        <ArrowLeft size={18} /> Back to{" "}
        {basePath === "/map" ? "orchard map" : "harvest logs"}
      </Link>
      <div className="d-detail-grid">
        <article className="d-evidence">
          <div className="d-event-top">
            <span className="d-event-id">Event #{event.id}</span>
            <Badge status={event.status} />
          </div>
          <h2>What happened?</h2>
          <p>{event.camera}</p>
          <div className="d-camera">
            <Camera size={38} aria-hidden="true" />
            <strong>
              Backend prediction: {event.prediction || "Unavailable"}
            </strong>
            <p>
              Confidence:{" "}
              {event.confidence === null
                ? "Unavailable"
                : `${event.confidence}%`}
            </p>
            <p>Camera image unavailable.</p>
          </div>
          <dl className="d-facts">
            <div>
              <dt>Sensor node</dt>
              <dd>{event.node}</dd>
            </div>
            <div>
              <dt>Event time · MYT</dt>
              <dd>{date(event.time)}</dd>
            </div>
          </dl>
          <h3>Vibration evidence</h3>
          <div className="d-measurements">
            <div>
              <strong>
                {event.amplitude === null
                  ? "Unavailable"
                  : `${event.amplitude} g`}
              </strong>
              <span>Amplitude</span>
            </div>
            <div>
              <strong>
                {event.frequency === null
                  ? "Unavailable"
                  : `${event.frequency} Hz`}
              </strong>
              <span>Frequency</span>
            </div>
            <div>
              <strong>
                {event.duration === null
                  ? "Unavailable"
                  : `${event.duration} s`}
              </strong>
              <span>Duration</span>
            </div>
          </div>
        </article>

        <aside className="d-feedback">
          <h2>Your feedback</h2>
          {["VERIFIED", "REJECTED"].includes(event.status) && !previous ? (
            <div className="d-notice">
              <strong>This event has already been reviewed.</strong>
              <p>Status: {event.status}</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <fieldset disabled={saving || saved}>
                <legend>How would you classify this event?</legend>
                {[
                  ["confirmed", "Confirm durian"],
                  ["rejected", "False alarm"],
                ].map(([value, text]) => (
                  <label
                    className={`d-choice ${label === value ? "d-selected" : ""}`}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="feedback"
                      value={value}
                      required
                      checked={label === value}
                      onChange={() => {
                        setLabel(value);
                        setSaved(false);
                      }}
                    />
                    {text}
                  </label>
                ))}
                {label === "rejected" && (
                  <label className="d-field">
                    False-alarm category
                    <select
                      required
                      value={category}
                      onChange={(e) => {
                        setCategory(e.target.value);
                        setSaved(false);
                      }}
                    >
                      <option value="">Choose a category</option>
                      {categories.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                )}

                {/* THIS IS THE NEW INPUT TO UPLOAD THE MONKEY IMAGE */}
                <label className="d-field">
                  Upload feedback image (optional)
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => {
                      setFile(e.target.files[0] || null);
                      setSaved(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      minWidth: 0,
                      marginTop: "8px",
                      padding: "8px",
                      background: "#f4f4f4",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                    }}
                  />
                </label>

                <label className="d-field">
                  Field note (optional)
                  <textarea
                    maxLength={500}
                    rows={3}
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value);
                      setSaved(false);
                    }}
                    placeholder="What did you notice?"
                  />
                </label>
                <button className="d-primary" type="submit">
                  {saving
                    ? "Submitting…"
                    : saved
                      ? "Feedback submitted"
                      : "Submit Feedback"}
                </button>
              </fieldset>
            </form>
          )}
          {error && (
            <p className="d-error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="d-success" role="status">
              Feedback accepted by the backend. Training queue insertion and
              model retraining are not verified.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
