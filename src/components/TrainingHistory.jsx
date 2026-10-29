import { useCallback, useEffect, useRef, useState } from "react";
import { TrendingUp, RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchTraining, retrain } from "../services/api";
import { normalizeTraining } from "../services/trainingData";
import { farmDate } from "../services/farmData";
const workerLabels = {
  idle: "No training run recorded in this backend process",
  processing: "Training script is running · progress unavailable",
  success: "Training script finished · evaluation and deployment unverified",
  failed: "Training script failed",
};
export default function TrainingHistory() {
  const [result, setResult] = useState({
    stats: null,
    worker: null,
    available: false,
    loading: true,
    error: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const active = useRef(null);
  const loadStats = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    try {
      const data = await fetchTraining({ signal: controller.signal });
      const stats = normalizeTraining(data);
      if (!controller.signal.aborted)
        setResult({
          stats,
          worker: data.worker || null,
          available: data.retraining_available === true,
          loading: false,
          error: "",
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
    const timer = setTimeout(loadStats, 0);
    return () => {
      clearTimeout(timer);
      active.current?.abort();
    };
  }, [loadStats]);
  const processing = result.worker?.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(loadStats, 3000);
    return () => clearInterval(timer);
  }, [processing, loadStats]);
  async function handleRetrain() {
    if (pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await retrain();
      setMessage(response.message);
      try {
        localStorage.setItem("isRetraining", "true");
      } catch {
        /* Server state remains authoritative. */
      await retrain();
    } catch (err) {
      setRetraining(false);
      localStorage.removeItem("isRetraining");

      // NEW: Handle professional warnings
      if (err.message.includes("already in progress")) {
        alert(
          "⏳ The AI is currently learning from your feedback. Please wait for it to finish.",
        );
      } else if (err.message.includes("limit reached")) {
        alert(
          "⚠️ You have reached the limit for manual retraining today. The AI will automatically learn this Sunday.",
        );
      } else {
        alert(`Retraining failed to start: ${err.message}`);
      }
      await loadStats();
    } catch (error) {
      setMessage("");
      setResult((previous) => ({ ...previous, error: error.message }));
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }
  const { stats, worker, error } = result;
  if (result.loading)
    return (
      <p className="ui-notice" role="status">
        Loading training history…
      </p>
    );
  return (
    <div className="ui-page training-page">
      <header className="ui-page-header">
        <div>
          <h1>AI Training History</h1>
          <p className="ui-muted mt-2">
            Farmer feedback, training worker status and recorded model
            evaluations.
          </p>
        </div>
        <div className="ui-actions">
          <button className="ui-button" onClick={loadStats}>
            Refresh training status
          </button>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            width: "280px",
          }}
        >
          <button
            className="ui-button primary"
            onClick={handleRetrain}
            disabled={
              submitting || processing || !result.available || Boolean(error)
            }
          >
            <RefreshCw size={18} aria-hidden="true" />
            {submitting
              ? "Starting…"
              : processing
                ? "Training script running…"
                : "Retrain AI Now"}
          </button>
            <RefreshCw
              size={18}
              className={retraining ? "animate-spin" : ""}
              style={{ marginRight: "8px" }}
            />
            {retraining ? "Retraining AI..." : "Force Retrain Now"}
          </button>

          {/* NEW: Professional text explaining the hybrid system */}
          {!retraining && (
            <p
              style={{
                fontSize: "11px",
                color: "#64748b",
                marginTop: "6px",
                textAlign: "right",
                lineHeight: "1.4",
              }}
            >
              The AI automatically retrains <b>every Sunday</b>. <br />
              Click to force an immediate update.
            </p>
          )}

          {retraining && (
            <div style={{ marginTop: "12px", width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#37583a",
                  marginBottom: "4px",
                }}
              >
                <span>
                  <Clock
                    size={12}
                    style={{ display: "inline", marginRight: "4px" }}
                  />{" "}
                  {formatTime(elapsedTime)}
                </span>

                <span>
                  {remainingSeconds === 0
                    ? "Finishing up..."
                    : `Est. ${formatTime(remainingSeconds)} left`}
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "6px",
                  background: "#e2e8f0",
                  borderRadius: "3px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    background: "#37583a",
                    transition: "width 1s linear",
                  }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </header>
      {error && (
        <p className="ui-notice ui-error" role="alert">
          {error} {stats ? "Displayed data may be stale." : ""}{" "}
          <button className="ui-button" onClick={loadStats}>
            Try again
          </button>
        </p>
      )}
      {message && (
        <p className="ui-notice" role="status">
          {message}
        </p>
      )}
      {!result.available && !error && (
        <p className="ui-notice">
          Retraining is unavailable until the backend training executable and
          script are configured.
        </p>
      )}
      <dl className="ui-summary mt-4">
        <div>
          <dt>Submitted feedback</dt>
          <dd>{stats?.totalCorrections ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Queued feedback records</dt>
          <dd>{stats?.pendingTraining ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Current AI Accuracy</dt>
          <dd>
            {stats?.accuracy !== null && stats?.accuracy !== undefined
              ? `${stats.accuracy}%`
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Latest evaluation</dt>
          <dd>{farmDate(stats?.lastEvaluated)}</dd>
        </div>
      </dl>
      <section className="ui-panel mt-6">
        <h2>
          <TrendingUp size={20} aria-hidden="true" /> Model evaluation history
        </h2>
        {stats?.evaluations.length ? (
          <div style={{ height: "300px", width: "100%" }}>
            <ResponsiveContainer>
              <LineChart data={stats.evaluations}>
                <CartesianGrid stroke="#b6b265" strokeDasharray="3 3" />
                <XAxis dataKey="model_version" stroke="#37583a" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="#37583a" fontSize={12} />
                <Tooltip />
                <Line
                  dataKey="accuracy"
                  name="Accuracy (%)"
                  stroke="#37583a"
                  dot={{ r: 4, fill: "#ffdc83" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="ui-notice">
            No evaluated model results are available. Accuracy requires a
            recorded model version, evaluation date and test sample count.
          </p>
        )}
      </section>
      <section className="ui-panel mt-6">
        <h2>Model Status</h2>
        <p role="status" className="mt-2">
          {workerLabels[worker?.status] || "Training worker status unavailable"}
        </p>
        {worker?.error && (
          <p className="ui-notice ui-error" role="alert">
            {worker.error}
          </p>
        )}
        <p className="mt-2">
          Started: {farmDate(worker?.started_at)} · Finished:{" "}
          {farmDate(worker?.finished_at)}
        </p>
        <p className="ui-muted mt-2">
          Worker status is reset when the backend restarts. Queued feedback
          remains pending until a verified training pipeline records its
          processing. Model deployment to devices is unverified.
        </p>
      </section>
    </div>
  );
}
