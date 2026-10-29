import { useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { AuthContext } from "../services/AuthContext";
import {
  fetchFeedbackCategories,
  submitFeedback,
} from "../services/detectionApi";
import DetectionImages from "./DetectionImages";
const date = (value) =>
  new Date(value).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  });
const labels = { DURIAN: "Durian", NOT_DURIAN: "No Durian" };
export default function DetectionDetails({
  event,
  receipt,
  onSave,
  online,
  available,
  StatusBadge,
}) {
  const { farmer } = useContext(AuthContext);
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState(null);
  const [categories, setCategories] = useState({
    rows: [],
    loading: !receipt,
    error: "",
  });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (receipt) return;
    const controller = new AbortController();
    async function load() {
      setCategories({ rows: [], loading: true, error: "" });
      try {
        const rows = await fetchFeedbackCategories({
          signal: controller.signal,
        });
        if (!controller.signal.aborted)
          setCategories({ rows, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setCategories({ rows: [], loading: false, error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [attempt, receipt]);
  async function submit(e) {
    e.preventDefault();
    if (pending.current || receipt) return;
    if (!online || !available) {
      setError("Refresh the event while online before submitting feedback.");
      return;
    }
    const category = categories.rows.find((row) => row.id === categoryId);
    if ((label === "NOT_DURIAN" && !category) || (categoryId && !category)) {
      setError("Choose an available feedback category.");
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
      const image = file
        ? await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () =>
              reject(
                new Error(
                  "The feedback image could not be read. Please select it again.",
                ),
              );
            reader.onabort = () =>
              reject(new Error("Reading the feedback image was cancelled."));
            reader.readAsDataURL(file);
          })
        : null;
      const result = await submitFeedback(event.id, {
        farmerId: farmer?.farmer_id,
        label,
        categoryId,
        comment,
        image,
      });
      // Keep the acknowledgement even if the farmer navigated away during POST.
      onSave(event.id, {
        label,
        categoryId: category?.id || null,
        category: category?.name || "No category supplied",
        comment: comment.trim(),
        savedAt: result.feedback_at || new Date().toISOString(),
        feedbackId: String(result.feedback_id),
        eventTime: event.time,
      });
    } catch (error) {
      if (mounted.current) setError(error.message);
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <>
      <Link className="d-back" to="/map">
        <ArrowLeft size={18} /> Back to orchard map
      </Link>
      <div className="d-detail-grid">
        <article className="d-evidence">
          <div className="d-event-top">
            <span className="d-event-id">Event #{event.id}</span>
            <StatusBadge status={event.status} />
          </div>
          <h2>What happened?</h2>
          <p>
            Reported detection from the backend. Missing evidence remains
            unavailable.
          </p>
          <DetectionImages event={event} />
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
              <dd>
                {event.location
                  ? `${event.location.join(", ")} · node location reported ${event.locationRecordedAt ? date(event.locationRecordedAt) : "at an unavailable time"}; exact fruit position unavailable`
                  : "Unavailable · no device coordinates supplied"}
              </dd>
            </div>
            <div>
              <dt>Model prediction · backend record</dt>
              <dd>
                {event.prediction || "Unavailable"}
                {event.confidence !== null
                  ? ` · ${event.confidence}% confidence`
                  : " · confidence unavailable"}
              </dd>
            </div>
          </dl>
          <h3>Vibration evidence</h3>
          <div className="d-measurements">
            <div>
              <strong>
                {event.amplitude === null ? "Unavailable" : event.amplitude}
              </strong>
              <span>
                Amplitude
                {event.amplitude !== null
                  ? ` · ${event.amplitudeUnit || "unit unavailable"}`
                  : ""}
              </span>
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
          <p className="d-caption">
            A reported status is not independent proof of hardware or AI
            verification.
          </p>
        </article>
        <aside className="d-feedback">
          <h2>Your feedback</h2>
          <p>
            Record your own assessment. The model prediction remains separate.
          </p>
          {receipt ? (
            <div className="d-success" role="status">
              <strong>Feedback accepted by the server.</strong>
              <p>
                Your assessment: {labels[receipt.label]} · {receipt.category}
              </p>
              <p>{receipt.comment}</p>
              <p>
                {date(receipt.savedAt)} · submission #{receipt.feedbackId}
              </p>
            </div>
          ) : (
            <>
              {categories.loading && (
                <p role="status">Loading feedback categories…</p>
              )}
              {categories.error && (
                <div className="d-error" role="alert">
                  {categories.error}{" "}
                  <button
                    className="ui-button"
                    onClick={() => setAttempt((n) => n + 1)}
                  >
                    Retry categories
                  </button>
                </div>
              )}
              {!categories.loading &&
                !categories.error &&
                !categories.rows.length && (
                  <p className="d-notice">
                    No categories are configured. Durian can be submitted
                    without a category; No Durian needs an available category.
                  </p>
                )}
              <form onSubmit={submit}>
                <fieldset disabled={saving || !online || !available}>
                  <legend>How would you classify this event?</legend>
                  {Object.entries(labels).map(([value, text]) => (
                    <label
                      className={`d-choice ${label === value ? "d-selected" : ""}`}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="feedback"
                        required
                        value={value}
                        checked={label === value}
                        onChange={() => setLabel(value)}
                      />
                      {text}
                    </label>
                  ))}
                  <label className="d-field" htmlFor="feedback-category">
                    Feedback category
                    {label === "NOT_DURIAN"
                      ? " (required for No Durian)"
                      : " (optional)"}
                    <select
                      id="feedback-category"
                      disabled={categories.loading || Boolean(categories.error)}
                      required={label === "NOT_DURIAN"}
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                    >
                      <option value="">
                        {label === "NOT_DURIAN"
                          ? "Choose a category"
                          : "No category"}
                      </option>
                      {categories.rows.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="d-field" htmlFor="feedback-comment">
                    Detailed comments (optional)
                    <textarea
                      id="feedback-comment"
                      maxLength={500}
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="What did you observe?"
                    />
                  </label>
                  <label className="d-field" htmlFor="feedback-image">
                    Upload feedback image (optional)
                    <input
                      id="feedback-image"
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => setFile(e.target.files[0] || null)}
                    />
                  </label>
                  <button
                    className="d-primary"
                    type="submit"
                    disabled={
                      label === "NOT_DURIAN" &&
                      (categories.loading ||
                        Boolean(categories.error) ||
                        !categories.rows.length)
                    }
                  >
                    {saving ? "Submitting…" : "Submit feedback"}
                  </button>
                </fieldset>
                {!saving && (
                  <Link className="d-back" to="/map">
                    Cancel
                  </Link>
                )}
              </form>
              {error && (
                <p className="d-error" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
          <Link className="d-back" to="/analytics">
            View Harvest Logs <ArrowUpRight size={18} />
          </Link>
        </aside>
      </div>
    </>
  );
}
