import { useState, useEffect, useRef } from "react";

// Sample node readings only; no hardware is connected.
const INITIAL_HARDWARE = [
  {
    id: "NODE-01",
    location: "Alpha West Corner",
    battery: 84,
    status: "Connected",
    version: "v1.0.4",
    lastPing: "2 mins ago",
  },
  {
    id: "NODE-02",
    location: "Alpha East Ridge",
    battery: 92,
    status: "Connected",
    version: "v1.0.4",
    lastPing: "5 mins ago",
  },
  {
    id: "NODE-03",
    location: "Beta Boundary Tree",
    battery: 11,
    status: "Low Battery",
    version: "v1.0.2",
    lastPing: "1 min ago",
  },
];

export default function NodeManagement() {
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [nodes, setNodes] = useState(INITIAL_HARDWARE);
  const [updatingId, setUpdatingId] = useState(null);

  // Simulating an Over-The-Air (OTA) firmware/LiteRT model distribution flight
  const triggerOTAUpdate = (id) => {
    setUpdatingId(id);
    timer.current = setTimeout(() => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id
            ? { ...node, version: "v1.1.0 (Latest)", status: "Connected" }
            : node,
        ),
      );
      setUpdatingId(null);
    }, 3000);
  };

  return (
    <div className="ui-page">
      <header className="ui-page-header">
        <h1>Node Status</h1>
      </header>
      <p className="ui-notice">
        Simulation mode. Battery, connection state, last-seen times, and model
        versions are sample data. Updates run locally only.
      </p>
      <div className="ui-table-wrap">
        <table className="ui-table">
          <caption className="sr-only">Simulated sensor nodes</caption>
          <thead>
            <tr>
              {[
                "Node",
                "Location",
                "Battery",
                "Status",
                "Last seen · sample",
                "Model",
                "Action",
              ].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr key={node.id}>
                <td>
                  <strong>{node.id}</strong>
                </td>
                <td>{node.location}</td>
                <td>{node.battery}%</td>
                <td>{node.status}</td>
                <td>{node.lastPing}</td>
                <td>
                  <code>{node.version}</code>
                </td>
                <td>
                  <button
                    className="ui-button"
                    aria-label={`Simulate model update for ${node.id}`}
                    disabled={
                      updatingId !== null || node.version.includes("Latest")
                    }
                    onClick={() => triggerOTAUpdate(node.id)}
                  >
                    {updatingId === node.id
                      ? "Simulating…"
                      : node.version.includes("Latest")
                        ? "Demo updated"
                        : "Simulate update"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ui-muted" role="status">
        {updatingId
          ? `Simulating an update for ${updatingId}. No hardware is contacted.`
          : "No real model updates have been deployed."}
      </p>
    </div>
  );
}
