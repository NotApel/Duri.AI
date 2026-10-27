import { useEffect, useState } from "react";
import { TrendingUp, RefreshCw, Clock } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchTraining, retrain, apiRequest } from "../services/api";

export default function TrainingHistory() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const maxEstimate = 300;

  const loadStats = async () => {
    try {
      const data = await fetchTraining();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const isRetrainingStored = localStorage.getItem("isRetraining") === "true";
    if (isRetrainingStored) {
      setRetraining(true);
      const startTime = parseInt(
        localStorage.getItem("retrainStartTime") || Date.now(),
      );
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }
  }, []);

  useEffect(() => {
    let timer;
    if (retraining) {
      timer = setInterval(() => {
        const startTime = parseInt(
          localStorage.getItem("retrainStartTime") || Date.now(),
        );
        const newElapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTime(newElapsed);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(timer);
  }, [retraining]);

  useEffect(() => {
    let interval;
    if (retraining) {
      interval = setInterval(async () => {
        try {
          const data = await apiRequest("/analytics/retrain-status");
          await loadStats();

          if (data.status === "success" || data.status === "failed") {
            setRetraining(false);
            localStorage.removeItem("isRetraining");
            localStorage.removeItem("retrainStartTime");

            if (data.status === "success") {
              alert("AI Retraining Complete! The model is now smarter.");
            } else {
              alert("AI Retraining failed. Please check backend logs.");
            }
          }
        } catch (err) {
          console.error("Error checking status", err);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [retraining]);

  const handleRetrain = async () => {
    setRetraining(true);
    localStorage.setItem("isRetraining", "true");
    localStorage.setItem("retrainStartTime", Date.now().toString());

    try {
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
    }
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const progressPercent = Math.min((elapsedTime / maxEstimate) * 100, 99);
  const remainingSeconds = Math.max(maxEstimate - elapsedTime, 0);

  if (loading) return <p className="ui-notice">Loading training history...</p>;
  if (!stats)
    return <p className="ui-notice ui-error">Failed to load AI stats.</p>;

  return (
    <div className="ui-page">
      <header
        className="ui-page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1>AI Training History</h1>
          <p className="ui-muted mt-2">
            Track how your feedback makes the Duri.AI model smarter over time.
          </p>
        </div>

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
            disabled={retraining}
            style={{ width: "100%" }}
          >
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

      <dl className="ui-summary" style={{ marginTop: "20px" }}>
        <div>
          <dt>Farmer Points</dt>
          <dd>{stats.farmerPoints}</dd>
        </div>
        <div>
          <dt>Total Corrections</dt>
          <dd>{stats.totalCorrections}</dd>
        </div>
        <div>
          <dt>Waiting for Retraining</dt>
          <dd style={{ fontSize: "24px", lineHeight: "1.2" }}>
            {stats.pendingTraining} images
          </dd>
        </div>
        <div>
          <dt>Current AI Accuracy</dt>
          <dd style={{ color: "var(--canopy)", fontWeight: "bold" }}>
            {stats.currentAccuracy}%
          </dd>
        </div>
      </dl>

      <section className="ui-panel mt-6">
        <h2>
          <TrendingUp
            size={20}
            style={{ display: "inline", marginRight: "8px" }}
          />
          AI Accuracy Improvement
        </h2>
        <p className="ui-muted mb-4">
          The model retrains weekly using the images you upload.
        </p>
        <div style={{ height: "300px", width: "100%" }}>
          <ResponsiveContainer>
            <LineChart data={stats.accuracyHistory}>
              <CartesianGrid stroke="#b6b265" strokeDasharray="3 3" />
              <XAxis dataKey="week" stroke="#37583a" fontSize={12} />
              <YAxis domain={[80, 100]} stroke="#37583a" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--ui-surface)",
                  border: "1px solid #b6b265",
                  borderRadius: 6,
                  color: "#37583a",
                }}
              />
              <Line
                type="monotone"
                dataKey="accuracy"
                name="Accuracy (%)"
                stroke="#37583a"
                strokeWidth={3}
                dot={{ r: 6, fill: "#ffdc83" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="ui-panel mt-6">
        <h2>
          <RefreshCw
            size={20}
            style={{ display: "inline", marginRight: "8px" }}
          />
          Model Status
        </h2>
        <p className="mt-2">
          <strong>Last Retrained:</strong> {stats.lastRetrained}
        </p>
        <p className="mt-2">
          <strong>Queue Status:</strong>{" "}
          {stats.pendingTraining > 0
            ? `${stats.pendingTraining} images are waiting for the next scheduled retraining.`
            : "All feedback images have been processed."}
        </p>
      </section>
    </div>
  );
}
