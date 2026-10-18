import { useEffect, useState } from "react";
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

export default function TrainingHistory() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false); // NEW

  const fetchStats = () => {
    setLoading(true);
    fetch("http://localhost:3000/api/analytics/training")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // NEW: Trigger the Python script
  const handleRetrain = async () => {
    setRetraining(true);
    try {
      const res = await fetch("http://localhost:3000/api/analytics/retrain", {
        method: "POST",
      });
      if (res.ok) {
        fetchStats(); // Refresh chart and stats when done
      } else {
        alert("Retraining failed. Check backend terminal.");
      }
    } catch (err) {
      alert("Failed to connect to backend.");
    } finally {
      setRetraining(false);
    }
  };

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
          alignItems: "center",
        }}
      >
        <div>
          <h1>AI Training History</h1>
          <p className="ui-muted mt-2">
            Track how your feedback makes the Duri.AI model smarter over time.
          </p>
        </div>

        {/* NEW: The Retrain Button */}
        <button
          className="ui-button primary"
          onClick={handleRetrain}
          disabled={retraining}
        >
          <RefreshCw
            size={18}
            className={retraining ? "animate-spin" : ""}
            style={{ marginRight: "8px" }}
          />
          {retraining ? "Retraining AI..." : "Retrain AI Now"}
        </button>
      </header>

      <dl className="ui-summary">
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
          <dd>{stats.pendingTraining} images</dd>
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
