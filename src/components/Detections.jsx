import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Camera, RefreshCw } from "lucide-react";
import "./Detections.css";

const statuses = {
  PENDING: "Candidate",
  VERIFYING: "Verifying",
  VERIFIED: "Confirmed · AI",
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

  // Fetch REAL data from the backend
  async function load() {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:3000/api/detections");
      if (!response.ok) throw new Error("Backend failed");
      const data = await response.json();

      // Map backend database rows to the UI's expected format
      const mappedEvents = data.map((d) => ({
        id: d.detection_id,
        node: d.node_name || "NODE-01",
        time: d.detection_at,
        status: d.detection_status,
        prediction: d.prediction === "DURIAN" ? "Durian" : "Not durian",
        confidence: d.confidence,
        amplitude: 0.81, // Mocked for UI since backend doesn't return reading data here
        frequency: 18.0,
        duration: 0.72,
        camera: `Sensor reading from ${d.node_name || "Node"}`,
      }));

      setEvents(mappedEvents);
      setLoadError("");
    } catch (err) {
      setLoadError(
        "Could not connect to backend. Make sure Node.js is running on port 3000.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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

  const event = events.find((item) => item.id == eventId);

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
          <strong>Live Backend Mode</strong>
          <span>Connected to PostgreSQL database · AI retraining enabled</span>
        </div>
      </div>
      {!online && (
        <p className="d-notice" role="status">
          You’re offline. Viewing local data only.
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
            onRefresh={load}
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
              {events.filter((item) => item.status === "PENDING").length}
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
            {filtered.length} events · real data from database
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
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Helper to convert file to base64
  const toBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });

  function submit(e) {
    e.preventDefault();
    if (label === "rejected" && !category) {
      setError("Please select a false-alarm category.");
      return;
    }

    setSaving(true);
    setError("");
    setSaved(false);

    timer.current = setTimeout(async () => {
      try {
        let base64Image = null;
        if (file) {
          base64Image = await toBase64(file);
        }

        // Map category string to database category ID
        const categoryMap = {
          Wind: 1,
          Animal: 2,
          "Human Activity": 3,
          Other: 4,
        };

        // CONNECT TO NODE.JS BACKEND
        const response = await fetch(
          `http://localhost:3000/api/detections/${event.id}/feedback`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              farmer_id: 1, // Assuming farmer 1 is logged in
              category_id: category ? categoryMap[category] : null,
              correct_detection: label === "confirmed",
              comment_farmer: comment,
              image_base64: base64Image,
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Backend rejected the feedback.");
        }

        // Save to local UI state and refresh the main list
        onSave(saveLocalFeedback(records, event.id, label, category, comment));
        setSaved(true);
        if (onRefresh) onRefresh();
      } catch (err) {
        setError("Failed to connect to backend. Check if Node.js is running.");
      } finally {
        setSaving(false);
      }
    }, 250);
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
            <strong>AI Prediction: {event.prediction}</strong>
            <p>Confidence: {event.confidence}%</p>
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
              <strong>{event.amplitude} g</strong>
              <span>Amplitude</span>
            </div>
            <div>
              <strong>{event.frequency} Hz</strong>
              <span>Frequency</span>
            </div>
            <div>
              <strong>{event.duration} s</strong>
              <span>Duration</span>
            </div>
          </div>
        </article>

        <aside className="d-feedback">
          <h2>Your feedback</h2>
          {event.status !== "PENDING" && !previous ? (
            <div className="d-notice">
              <strong>This event has already been reviewed.</strong>
              <p>Status: {event.status}</p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <fieldset disabled={saving}>
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
                  Upload Camera Image (Simulate Pi)
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setFile(e.target.files[0]);
                      setSaved(false);
                    }}
                    style={{
                      display: "block",
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
                  {saving ? "Sending to Backend..." : "Submit Feedback"}
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
              ✅ Feedback saved to Database! Image sent to backend for AI
              retraining.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
