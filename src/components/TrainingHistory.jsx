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
// Backend status values come from the ai_status table: idle, requested,
// training, completed, failed. "Waiting for Retraining" is not a backend
// status; it is shown when feedback is queued but no run has started yet.
const workerLabels = {
  idle: "No training run recorded yet.",
  waiting: "Waiting for Retraining",
  requested: "Retrain requested · waiting for the worker to start.",
  training: "Training in progress.",
  completed: "Last training run completed.",
  failed: "Training script failed.",
};
const ACTIVE_STATUSES = ["requested", "training"];
export default function TrainingHistory() {
  const [result, setResult] = useState({
    stats: null,
    worker: null,
    lastRetrained: null,
    schedule: null,
    waiting: false,
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
          lastRetrained: data.lastRetrained || null,
          schedule: data.weekly_schedule || null,
          waiting: data.waiting_for_retrain === true,
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
  const processing = ACTIVE_STATUSES.includes(result.worker?.status);
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
      await loadStats();
    } catch (error) {
      setMessage("");
      setResult((previous) => ({ ...previous, error: error.message }));
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }
  const { stats, worker, waiting, error } = result;
  // "Waiting for Retraining" only applies when nothing is already running.
  const statusKey = !processing && waiting ? "waiting" : worker?.status;
  const statusLabel = workerLabels[statusKey] || "Training worker status unavailable.";
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
                ? "Training in progress…"
                : "Force Retrain Now"}
          </button>
        </div>
      </header>
      <p className="ui-notice">
        {result.schedule
          ? `The AI automatically retrains every Sunday (${result.schedule}). Click to force an immediate update.`
          : "The AI automatically retrains every Sunday. Click to force an immediate update."}
      </p>
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
              ? `${stats.accuracy}%${stats.accuracyVerified ? "" : " (self-reported)"}`
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Last AI training</dt>
          <dd>{result.lastRetrained || "Not yet retrained"}</dd>
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
          {statusLabel}
        </p>
        {worker?.message && (
          <p className="ui-muted mt-2">{worker.message}</p>
        )}
        {worker?.status === "failed" && worker?.message && (
          <p className="ui-notice ui-error" role="alert">
            {worker.message}
          </p>
        )}
        <p className="mt-2">Last updated: {farmDate(worker?.updated_at)}</p>
        <p className="ui-muted mt-2">
          Worker status is reset when the backend restarts. Queued feedback
          remains pending until a verified training pipeline records its
          processing. Model deployment to devices is unverified.
        </p>
      </section>
    </div>
  );
}