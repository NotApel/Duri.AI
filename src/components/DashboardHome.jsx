import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function DashboardHome() {
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const read = async (path) => {
          const response = await fetch(`http://localhost:3000/api/${path}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Request failed");
          return response.json();
        };
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
  }, [attempt]);
  const nodes =
    data?.nodes.filter((node) =>
      `${node.node_name}`.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="ui-page">
      <header className="ui-page-header">
        <h1>Dashboard</h1>
        <Link className="ui-button" to="/map">
          Open Orchard Map
        </Link>
      </header>
      {error ? (
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
            Recent events refer to the latest ten records returned by the API.
            Orchard area and harvest weight are unavailable.
          </p>
        </>
      )}
      <Link className="ui-text-link" to="/analytics">
        View Harvest Logs (simulated events)
      </Link>
    </div>
  );
}
