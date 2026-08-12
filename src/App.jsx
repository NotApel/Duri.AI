// src/App.jsx

import React, { useState, useEffect } from "react";
import { fetchAlerts, fetchStats, fetchHealth } from "./services/api";
import "./App.css";

function App() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({});
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [alertsData, statsData, healthData] = await Promise.all([
          fetchAlerts(),
          fetchStats(),
          fetchHealth(),
        ]);
        setAlerts(alertsData);
        setStats(statsData);
        setHealth(healthData);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <h2>🌳 Loading Duri.AI...</h2>
        <p>Connecting to backend...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>⚠️ Error: {error}</h2>
        <p>Make sure the backend is running on port 3000</p>
        <p>
          Run: <code>cd backend && npm run dev</code>
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🌳 Duri.AI Dashboard</h1>
        <p>Status: {health?.message || "Unknown"}</p>
      </header>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Durians</h3>
          <p className="stat-number">{stats.total || 0}</p>
        </div>
        <div className="stat-card">
          <h3>Avg Confidence</h3>
          <p className="stat-number">{stats.confidence || 0}%</p>
        </div>
        <div className="stat-card">
          <h3>False Alarm Rate</h3>
          <p className="stat-number">{stats.falseAlarmRate || 0}%</p>
        </div>
        <div className="stat-card">
          <h3>Active Nodes</h3>
          <p className="stat-number">{stats.activeNodes || 0}/4</p>
        </div>
      </div>

      {/* Alerts List */}
      <div className="alerts-section">
        <h2>🔔 Recent Alerts</h2>
        {alerts.length === 0 ? (
          <p className="no-alerts">No alerts yet. Your farm is quiet.</p>
        ) : (
          <div className="alerts-list">
            {alerts.map((alert) => (
              <div key={alert.id} className="alert-item">
                <div className="alert-info">
                  <strong>{alert.nodeName}</strong>
                  <span className="alert-time">
                    {new Date(alert.createdAt).toLocaleString()}
                  </span>
                </div>
                <span
                  className={`alert-confidence ${alert.confidence > 90 ? "high" : "medium"}`}
                >
                  {alert.confidence}% confident
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
