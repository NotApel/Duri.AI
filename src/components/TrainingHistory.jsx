import { useEffect, useRef, useState } from "react";
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

export default function TrainingHistory() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mounted = useRef(false);
  const pending = useRef(false);
  async function load(signal) {
    try {
      const result = await fetchTraining({ signal });
      if (mounted.current) {
        setStats(result);
        setError("");
      }
    } catch (err) {
      if (mounted.current && err.name !== "AbortError") setError(err.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => load(controller.signal), 0);
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  async function handleRetrain() {
    if (pending.current) return;
    pending.current = true;
    setRetraining(true);
    setError("");
    setMessage("");
    try {
      await retrain();
      if (mounted.current) {
        setMessage(
          "The backend reports that the training command completed. Model improvement is not verified until evaluation results are available.",
        );
        await load();
      }
    } catch (err) {
      if (mounted.current) setError(err.message);
    } finally {
      pending.current = false;
      if (mounted.current) setRetraining(false);
    }
  }
  if (loading)
    return (
      <p className="ui-notice" role="status">
        Loading training history…
      </p>
    );
  if (!stats)
    return (
      <section className="ui-page">
        <h1>AI Training History</h1>
        <p className="ui-notice ui-error" role="alert">
          {error || "Training statistics are unavailable."}
        </p>
        <button
          className="ui-button"
          onClick={() => {
            setLoading(true);
            load();
          }}
        >
          Try again
        </button>
      </section>
    );
  const history = stats.evaluations.map((item) => ({
    ...item,
    date: new Date(item.evaluated_at).toLocaleDateString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
    }),
  }));
  return (
    <div className="ui-page">
      <header className="ui-page-header">
        <div>
          <h1>AI Training History</h1>
          <p className="ui-muted mt-2">
            Feedback counts and available model evaluation results.
          </p>
        </div>
        <button
          className="ui-button primary"
          onClick={handleRetrain}
          disabled={retraining}
        >
          <RefreshCw size={18} aria-hidden="true" />
          {retraining ? "Training request in progress…" : "Request retraining"}
        </button>
      </header>
      {error && (
        <p className="ui-notice ui-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="ui-notice" role="status">
          {message}
        </p>
      )}
      <dl className="ui-summary">
        <div>
          <dt>Feedback points · backend calculation</dt>
          <dd>{stats.farmerPoints ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Total feedback records</dt>
          <dd>{stats.totalCorrections ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Pending queue records</dt>
          <dd>{stats.pendingTraining ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Evaluated model accuracy</dt>
          <dd>
            {stats.accuracy === null ? "Unavailable" : `${stats.accuracy}%`}
          </dd>
        </div>
      </dl>
      <section className="ui-panel mt-6">
        <h2>
          <TrendingUp size={20} className="inline mr-2" aria-hidden="true" />
          Model evaluation history
        </h2>
        {history.length ? (
          <div style={{ height: 300, width: "100%" }}>
            <ResponsiveContainer>
              <LineChart data={history}>
                <CartesianGrid stroke="#b6b265" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#37583a" fontSize={12} />
                <YAxis domain={[0, 100]} stroke="#37583a" fontSize={12} />
                <Tooltip />
                <Line
                  type="linear"
                  dataKey="accuracy"
                  name="Evaluated accuracy (%)"
                  stroke="#37583a"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="ui-notice mt-4">
            No evaluated model results were supplied. Placeholder accuracy
            values from the current backend are not presented as measured
            performance.
          </p>
        )}
      </section>
      <section className="ui-panel mt-6">
        <h2>Model status</h2>
        <p className="mt-2">
          <strong>Last evaluated:</strong>{" "}
          {stats.lastEvaluated
            ? new Date(stats.lastEvaluated).toLocaleString("en-MY", {
                timeZone: "Asia/Kuala_Lumpur",
              })
            : "Unavailable"}
        </p>
        <p className="mt-2">
          <strong>Queue status:</strong>{" "}
          {stats.pendingTraining === null
            ? "Unavailable"
            : `${stats.pendingTraining} pending records reported by the backend. This does not verify a scheduled training run.`}
        </p>
      </section>
    </div>
  );
}
