import { useRef, useState } from "react";
import { useFarm } from "../services/FarmContext";
import { useFarmList } from "../services/useFarmList";
import { saveBackendNode } from "../services/farmApi";
import { farmDate } from "../services/farmData";
import { FarmPlotPicker, FarmListState } from "./FarmControls";
export default function NodeManagement() {
  const {
    mode,
    state,
    plots,
    selectedPlotId,
    selectPlot,
    dispatch,
    backendPlots,
    online,
  } = useFarm();
  const backend = useFarmList("nodes", selectedPlotId, mode === "backend");
  const nodes =
    mode === "simulation"
      ? state.nodes.filter((n) => n.plot_id === selectedPlotId)
      : backend.rows;
  const [draft, setDraft] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const heading = useRef(null);
  const selected = nodes.find((n) => n.node_id === selectedId);
  const unavailable =
    mode === "backend" &&
    (!online ||
      backend.loading ||
      backendPlots.loading ||
      Boolean(backend.error || backendPlots.error));
  function edit(node) {
    setDraft(
      node
        ? { ...node, firmware_version: node.firmware_version || "" }
        : { node_name: "", firmware_version: "", plot_id: selectedPlotId },
    );
    setError("");
    setMessage("");
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function save(e) {
    e.preventDefault();
    if (pending.current || unavailable) return;
    setError("");
    if (!plots.some((p) => p.plot_id === draft.plot_id)) {
      setError("Select an available farm plot.");
      return;
    }
    if (mode === "simulation") {
      const id = draft.node_id || `SIM-NODE-${crypto.randomUUID()}`;
      if (dispatch({ type: "saveNode", id, draft })) {
        selectPlot(draft.plot_id);
        setSelectedId(id);
        setDraft(null);
        setMessage(
          "Node configuration saved in this browser simulation. No hardware was registered or updated.",
        );
      }
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      const result = await saveBackendNode(draft);
      selectPlot(result.plot_id);
      setSelectedId(result.node_id);
      setDraft(null);
      setMessage(
        "Node configuration saved by the backend. This does not install firmware or confirm device connectivity.",
      );
      backend.refresh();
    } catch (error) {
      setError(error.message);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  function simulate(type, status) {
    const saved = dispatch({
      type,
      id: selected.node_id,
      status,
      now: new Date().toISOString(),
      eventId: `SIM-EVENT-${crypto.randomUUID()}`,
      notificationId: `SIM-NOTICE-${crypto.randomUUID()}`,
    });
    if (saved)
      setMessage(
        type === "candidate"
          ? "Simulated candidate and unread notification created. No harvest has been confirmed."
          : `Simulated connection set to ${status}. No device was contacted.`,
      );
  }
  return (
    <>
      {mode === "backend" && (
        <FarmListState resource={backendPlots} noun="farm plots" />
      )}
      <div className="farm-toolbar">
        <FarmPlotPicker
          onChange={() => {
            setSelectedId("");
            setDraft(null);
            setMessage("");
            setError("");
          }}
        />
        <button
          className="ui-button primary"
          disabled={!selectedPlotId || saving || unavailable}
          onClick={() => edit()}
        >
          Register node
        </button>
        {mode === "backend" && (
          <button
            className="ui-button"
            disabled={!selectedPlotId || backend.loading}
            onClick={backend.refresh}
          >
            Refresh nodes
          </button>
        )}
      </div>
      {!selectedPlotId && (
        <p className="ui-notice">
          Select a farm plot to manage its nodes. Create a plot first if none
          are available.
        </p>
      )}
      {mode === "backend" && selectedPlotId && (
        <FarmListState resource={backend} noun="sensor nodes" />
      )}
      {mode === "backend" && !online && (
        <p role="status" className="ui-notice">
          You’re offline. Backend node changes require a connection.
        </p>
      )}
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
      {selectedPlotId && (
        <div className="ui-table-wrap">
          <table className="ui-table">
            <caption className="sr-only">
              {mode === "simulation" ? "Simulated" : "Backend"} sensor nodes for
              the selected plot
            </caption>
            <thead>
              <tr>
                {[
                  "Node",
                  "Connection",
                  "Battery",
                  "Firmware",
                  "Last heartbeat · MYT",
                ].map((text) => (
                  <th scope="col" key={text}>
                    {text}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.node_id}>
                  <td>
                    <button
                      className="ui-text-link"
                      aria-pressed={selectedId === node.node_id}
                      onClick={() => {
                        setSelectedId(node.node_id);
                        setDraft(null);
                        setError("");
                        setMessage("");
                      }}
                    >
                      {node.node_name}
                    </button>
                  </td>
                  <td>
                    {node.status}
                    {mode === "simulation" ? " · simulated" : ""}
                  </td>
                  <td>
                    {node.battery_level === null
                      ? "Unavailable"
                      : `${node.battery_level}%`}
                  </td>
                  <td>{node.firmware_version || "Unavailable"}</td>
                  <td>
                    {farmDate(node.last_ping_at)}
                    {mode === "simulation" && node.last_ping_at
                      ? " · simulated"
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!nodes.length &&
            (mode === "simulation" || (backend.loaded && !backend.error)) && (
              <p className="farm-empty" role="status">
                No nodes registered for this plot.
              </p>
            )}
        </div>
      )}
      {draft ? (
        <form className="ui-panel ui-form farm-editor" onSubmit={save}>
          <h2 ref={heading} tabIndex={-1}>
            {draft.node_id ? "Edit node assignment" : "Register node"}
          </h2>
          <fieldset disabled={saving}>
            <legend className="sr-only">Node configuration</legend>
            <label className="ui-field" htmlFor="node-plot">
              Assigned farm plot
              <select
                id="node-plot"
                required
                value={draft.plot_id}
                onChange={(e) =>
                  setDraft({ ...draft, plot_id: e.target.value })
                }
              >
                <option value="">Select a plot</option>
                {plots.map((p) => (
                  <option key={p.plot_id} value={p.plot_id}>
                    {p.farm_name} · {p.plot_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field" htmlFor="node-name">
              Node name
              <input
                id="node-name"
                required
                maxLength={50}
                value={draft.node_name}
                onChange={(e) =>
                  setDraft({ ...draft, node_name: e.target.value })
                }
              />
            </label>
            <label className="ui-field" htmlFor="node-firmware">
              Firmware version (optional)
              <input
                id="node-firmware"
                maxLength={20}
                value={draft.firmware_version}
                onChange={(e) =>
                  setDraft({ ...draft, firmware_version: e.target.value })
                }
              />
            </label>
            <p className="ui-muted">
              Registration records configuration only. New simulation nodes
              start OFFLINE with battery and heartbeat unavailable. Nodes with
              event history cannot be reassigned in this simulation.
            </p>
            <div className="ui-actions">
              <button
                className="ui-button primary"
                type="submit"
                disabled={unavailable}
              >
                {saving ? "Saving…" : "Save node"}
              </button>
              <button
                type="button"
                className="ui-button"
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        selected && (
          <section className="ui-panel">
            <h2>{selected.node_name}</h2>
            <dl className="farm-facts">
              <div>
                <dt>Assigned plot</dt>
                <dd>
                  {plots.find((p) => p.plot_id === selected.plot_id)
                    ?.plot_name || "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>
                  Connection
                  {mode === "simulation"
                    ? " · simulated"
                    : " · backend reported"}
                </dt>
                <dd>{selected.status}</dd>
              </div>
              <div>
                <dt>Last heartbeat · MYT</dt>
                <dd>{farmDate(selected.last_ping_at)}</dd>
              </div>
            </dl>
            <div className="ui-actions">
              <button
                className="ui-button"
                disabled={unavailable}
                onClick={() => edit(selected)}
              >
                Edit / reassign node
              </button>
              {mode === "simulation" && (
                <>
                  <button
                    className="ui-button"
                    onClick={() =>
                      simulate(
                        "connection",
                        selected.status === "ONLINE" ? "OFFLINE" : "ONLINE",
                      )
                    }
                  >
                    Simulate{" "}
                    {selected.status === "ONLINE" ? "offline" : "online"}
                  </button>
                  <button
                    className="ui-button"
                    onClick={() => simulate("candidate")}
                  >
                    Simulate candidate event
                  </button>
                </>
              )}
              <button className="ui-button" onClick={() => setSelectedId("")}>
                Close details
              </button>
            </div>
            {mode === "backend" && (
              <p className="ui-muted">
                Connection and battery are read-only device reports. Editing
                configuration does not change a device’s measured status.
              </p>
            )}
          </section>
        )
      )}
    </>
  );
}
