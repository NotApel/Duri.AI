import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Leaf,
  Radio,
  RefreshCw,
} from "lucide-react";
import { demoDetections } from "../data/demoDetections";
import {
  categories,
  feedbackLabels,
  readFeedback,
  saveFeedback,
} from "../services/demoFeedback";
import "./Detections.css";

const statuses = {
  PENDING: "Candidate",
  VERIFYING: "Verifying",
  VERIFIED: "Confirmed · simulated",
  REJECTED: "Rejected",
  FAILED: "Failed / unknown",
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
      {statuses[status]}
    </span>
  );
}

export default function Detections() {
  const { eventId } = useParams();
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [view, setView] = useState("needs");
  const [status, setStatus] = useState("");
  const [node, setNode] = useState("");
  const [day, setDay] = useState("");
  const heading = useRef(null);
  function load() {
    setLoading(true);
    try {
      setRecords(readFeedback());
      setLoadError("");
    } catch {
      setLoadError(
        "Saved demo feedback could not be read. Allow browser storage or restore valid saved data, then try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(load, 0);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("storage", load);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("storage", load);
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [eventId]);
  const event = demoDetections.find((item) => item.id === eventId);
  const filtered = demoDetections.filter(
    (item) =>
      (view === "all" ||
        (view === "reviewed" ? records[item.id] : !records[item.id])) &&
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
        <Leaf size={19} aria-hidden="true" />
        <div>
          <strong>Simulation mode</strong>
          <span>
            Scripted events · feedback stays in this browser · no hardware or AI
            training connected
          </span>
        </div>
      </div>
      {!online && (
        <p className="d-notice" role="status">
          You’re offline. Viewing local simulation fixtures only. Feedback is
          saved locally and will not sync to a server.
        </p>
      )}
      <header className="d-heading">
        <div>
          <p className="d-eyebrow">DURI.AI / FIELD NOTES</p>
          <h1 ref={heading} tabIndex={-1}>
            {eventId ? "Detection details" : "Orchard detections"}
          </h1>
          <p>Evidence first. Every fall has a story.</p>
        </div>
        <span className="d-edition">
          DEMO COLLECTION
          <br />
          17 OCT 2026 · MYT
        </span>
      </header>
      {loading ? (
        <p className="d-empty" role="status">
          Loading simulated detections…
        </p>
      ) : loadError ? (
        <div className="d-empty" role="alert">
          <h2>Demo storage unavailable</h2>
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
          />
        ) : (
          <div className="d-empty">
            <h2>Event not found</h2>
            <Link to="/detections">Return to detections</Link>
          </div>
        )
      ) : (
        <>
          <div className="d-summary">
            <strong>
              {demoDetections.filter((item) => !records[item.id]).length}
            </strong>
            <span>simulated events awaiting your review</span>
            <Radio size={28} aria-hidden="true" />
          </div>
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
          <div className="d-filters">
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
                {[...new Set(demoDetections.map((item) => item.node))].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
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
              }}
            >
              Clear filters
            </button>
          </div>
          <p className="d-caption" aria-live="polite">
            {filtered.length} events · timestamps in Malaysia time · sample
            measurements only
          </p>
          <div className="d-list">
            {filtered.map((item) => (
              <Link
                className="d-event"
                key={item.id}
                to={`/detections/${item.id}`}
              >
                <div className="d-event-icon">
                  <Leaf aria-hidden="true" />
                </div>
                <div className="d-event-body">
                  <div className="d-event-top">
                    <span className="d-eyebrow">SIMULATION / {item.id}</span>
                    <Badge status={item.status} />
                  </div>
                  <h2>
                    {item.status === "VERIFIED"
                      ? "Durian detected in simulation"
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
              <Leaf size={32} aria-hidden="true" />
              <h2>No events in this view</h2>
              <p>
                Try another filter or choose All events to explore the
                simulation.
              </p>
              <button
                onClick={() => {
                  setView("all");
                  setStatus("");
                  setNode("");
                  setDay("");
                }}
              >
                Show all events
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EventDetails({ event, records, onSave }) {
  const previous = records[event.id];
  const [label, setLabel] = useState(previous?.label || "");
  const [category, setCategory] = useState(previous?.category || "");
  const [comment, setComment] = useState(previous?.comment || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    timer.current = setTimeout(() => {
      try {
        onSave(saveFeedback(records, event.id, label, category, comment));
        setSaved(true);
      } catch (err) {
        setError(
          err.message.includes("category")
            ? err.message
            : "Feedback could not be saved. Check browser storage and try again. Your selection is retained.",
        );
      } finally {
        setSaving(false);
      }
    }, 250);
  }
  return (
    <>
      <Link className="d-back" to="/detections">
        <ArrowLeft size={18} /> Back to detections
      </Link>
      <div className="d-detail-grid">
        <article className="d-evidence">
          <div className="d-event-top">
            <span className="d-eyebrow">SIMULATION / {event.id}</span>
            <Badge status={event.status} />
          </div>
          <h2>What happened?</h2>
          <p>{event.camera}</p>
          <div className="d-camera">
            <Camera size={38} aria-hidden="true" />
            <strong>Camera image unavailable</strong>
            <p>
              No camera is connected. This scenario uses a scripted verification
              result, not a captured image.
            </p>
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
            <div>
              <dt>Location</dt>
              <dd>Unavailable — no device coordinates</dd>
            </div>
            <div>
              <dt>System prediction · simulated</dt>
              <dd>
                {event.prediction || "Not available"}
                {event.confidence !== null &&
                  ` · ${event.confidence}% sample confidence`}
              </dd>
            </div>
          </dl>
          <h3>Simulated vibration evidence</h3>
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
          <p className="d-caption">
            Fixture measurements only. Vibration alone does not confirm a durian
            fall.
          </p>
        </article>
        <aside className="d-feedback">
          <p className="d-eyebrow">FARMER FIELD NOTE</p>
          <h2>Your feedback</h2>
          <p>
            Record what you observed. Your response is kept separate from the
            system prediction.
          </p>
          {previous && (
            <div className="d-notice">
              <strong>{feedbackLabels[previous.label]}</strong>
              <p>
                {previous.category && `${previous.category} · `}Saved{" "}
                {date(previous.savedAt)}. You can revise it below.
              </p>
            </div>
          )}
          <form onSubmit={submit}>
            <fieldset disabled={saving}>
              <legend>How would you classify this event?</legend>
              {[
                ["confirmed", "Confirm durian"],
                ["rejected", "False alarm"],
                ["unsure", "Unsure"],
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
                  ? "Saving locally…"
                  : previous
                    ? "Update simulated feedback"
                    : "Save simulated feedback"}
              </button>
            </fieldset>
          </form>
          {error && (
            <p className="d-error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="d-success" role="status">
              Simulated feedback saved in this browser. Open Reviewed history to
              find it. No model was retrained.
            </p>
          )}
          <p className="d-caption">
            This does not change the system detection status, contact a server,
            or trigger a harvest notification.
          </p>
        </aside>
      </div>
    </>
  );
}
