import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { demoDetections } from "../data/demoDetections";
import { apiRequest } from "../services/api";
import HarvestChart from "./HarvestChart";

const demoNodes = [
  {
    node_id: "SIM-NODE-01",
    node_name: "SIM-NODE-01",
    status: "ONLINE",
    battery_level: 84,
  },
  {
    node_id: "SIM-NODE-02",
    node_name: "SIM-NODE-02",
    status: "ONLINE",
    battery_level: 92,
  },
  {
    node_id: "SIM-NODE-03",
    node_name: "SIM-NODE-03",
    status: "OFFLINE",
    battery_level: 11,
  },
];
const demoData = {
  detections: demoDetections.map((event) => ({
    ...event,
    node_name: event.node,
  })),
  stats: {
    total: demoDetections.length,
    verified: demoDetections.filter((event) => event.status === "VERIFIED")
      .length,
  },
  nodes: demoNodes,
};

export default function DashboardHome() {
  const [mode, setMode] = useState("simulation");
  const [search, setSearch] = useState("");
  const [liveData, setData] = useState(null);
  const data = mode === "simulation" ? demoData : liveData;
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (mode !== "live") return;
    const controller = new AbortController();
    async function load() {
      try {
        const read = (path) =>
          apiRequest(`/${path}`, { signal: controller.signal });
        const [detections, stats, nodes] = await Promise.all([
          read("detections"),
          read("analytics/stats"),
          read("plots/1/nodes"),
        ]);
        if (
          !Array.isArray(detections) ||
          !Array.isArray(nodes) ||
          typeof stats.total !== "number"
        )
          throw new Error("Unexpected response");
        setData({ detections, stats, nodes });
      } catch (err) {
        if (err.name !== "AbortError")
          setError(
            "Orchard data is unavailable. Check that the backend and database are running, then try again.",
          );
      }
    }
    load();
    return () => controller.abort();
  }, [attempt, mode]);
  const nodes =
    data?.nodes.filter((node) =>
      `${node.node_name}`.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="ui-page dashboard-grid">
      <header className="ui-page-header">
        <h1>Dashboard</h1>
        <Link className="ui-button" to="/map">
          Open Orchard Map
        </Link>
      </header>
      <div className="ui-page-header">
        <label className="ui-field" htmlFor="dashboard-source">
          Data source
          <select
            id="dashboard-source"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setError("");
              setData(null);
            }}
          >
            <option value="simulation">Simulation · presentation data</option>
            <option value="live">Backend · database records</option>
          </select>
        </label>
      </div>
      {mode === "simulation" && (
        <p className="ui-notice">
          <strong>Simulation mode.</strong> Events, node status, battery levels,
          and weekly chart values are sample data for your presentation. No
          backend is required.
        </p>
      )}
      {mode === "live" && error ? (
        <section className="ui-panel">
          <h2>Unable to load orchard data</h2>
          <p className="ui-notice ui-error mb-4" role="alert">
            {error}
          </p>
          <button
            className="ui-button"
            onClick={() => {
              setError("");
              setData(null);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </section>
      ) : !data ? (
        <p className="ui-notice" role="status">
          Loading orchard data…
        </p>
      ) : (
        <>
          <dl className="ui-summary">
            <div>
              <dt>Total events</dt>
              <dd>{data.stats.total}</dd>
            </div>
            <div>
              <dt>Verified events</dt>
              <dd>{data.stats.verified ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Online nodes · Plot 1</dt>
              <dd>
                {data.nodes.filter((node) => node.status === "ONLINE").length} /{" "}
                {data.nodes.length}
              </dd>
            </div>
          </dl>
          <div className="ui-page-header">
            <h2>Sensor nodes · Plot 1</h2>
            <label className="ui-field" htmlFor="node-search">
              Search nodes
              <input
                id="node-search"
                type="search"
                className="ui-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Node name"
              />
            </label>
          </div>
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Node</th>
                  <th scope="col">Status</th>
                  <th scope="col">Battery</th>
                  <th scope="col">Recent events</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => (
                  <tr key={node.node_id}>
                    <td>{node.node_name}</td>
                    <td>{node.status || "Unknown"}</td>
                    <td>
                      {node.battery_level == null
                        ? "Unavailable"
                        : `${node.battery_level}%`}
                    </td>
                    <td>
                      {
                        data.detections.filter(
                          (event) => event.node_name === node.node_name,
                        ).length
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!nodes.length && (
              <p className="p-6 ui-muted">
                {data.nodes.length
                  ? "No nodes match your search."
                  : "No sensor nodes are registered for this plot."}
              </p>
            )}
          </div>
          <p className="ui-muted">
            {mode === "simulation"
              ? "Sample readings only. These nodes and events are not connected to real hardware."
              : "Recent events refer to the latest ten records returned by the API. Orchard area and harvest weight are unavailable."}
          </p>
        </>
      )}
      {mode === "simulation" && (
        <>
          <section className="ui-panel dashboard-recent">
            <h2>Recent detections · simulation</h2>
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th scope="col">Time (MYT)</th>
                    <th scope="col">Node</th>
                    <th scope="col">Detection</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {demoDetections.map((event) => (
                    <tr key={event.id}>
                      <td>
                        {new Date(event.time).toLocaleString("en-MY", {
                          timeZone: "Asia/Kuala_Lumpur",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>{event.node}</td>
                      <td>
                        {event.prediction ||
                          (event.status === "FAILED"
                            ? "Unknown · camera timeout"
                            : "Awaiting verification")}
                      </td>
                      <td>
                        <Link
                          className="ui-text-link"
                          to={`/map/events/${event.id}`}
                        >
                          Review {event.id}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="dashboard-chart">
            <HarvestChart />
          </div>
        </>
      )}
      <Link className="ui-text-link" to="/analytics">
        View Harvest Logs (simulated events)
      </Link>
    </div>
  );
}
