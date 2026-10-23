import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFarm } from "../services/FarmContext";
import { saveBackendPlot } from "../services/farmApi";
import { FarmListState } from "./FarmControls";
const blank = {
  farm_name: "",
  plot_name: "",
  plot_size: "",
  latitude: "",
  longitude: "",
};
export default function PlotManagement() {
  const {
    mode,
    plots,
    selectedPlotId,
    selectPlot,
    dispatch,
    backendPlots,
    farmerId,
    online,
  } = useFarm();
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const heading = useRef(null);
  const selected = plots.find((plot) => plot.plot_id === selectedPlotId);
  const unavailable =
    mode === "backend" &&
    (!online || backendPlots.loading || Boolean(backendPlots.error));
  function edit(plot = blank) {
    setDraft({
      ...plot,
      plot_size: plot.plot_size ?? "",
      latitude: plot.latitude ?? "",
      longitude: plot.longitude ?? "",
    });
    setMessage("");
    setError("");
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function save(e) {
    e.preventDefault();
    if (pending.current || unavailable) return;
    setError("");
    if (mode === "simulation") {
      const id = draft.plot_id || `SIM-PLOT-${crypto.randomUUID()}`;
      if (dispatch({ type: "savePlot", id, draft })) {
        setDraft(null);
        setMessage("Plot saved in this browser simulation.");
      }
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      const result = await saveBackendPlot(farmerId, draft);
      selectPlot(result.plot_id);
      setDraft(null);
      setMessage("Plot saved by the backend.");
      backendPlots.refresh();
    } catch (error) {
      setError(error.message);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <div className="ui-actions">
        <button
          className="ui-button primary"
          disabled={saving || unavailable}
          onClick={() => edit()}
        >
          Create plot
        </button>
        {mode === "backend" && (
          <button
            className="ui-button"
            disabled={backendPlots.loading}
            onClick={backendPlots.refresh}
          >
            Refresh plots
          </button>
        )}
      </div>
      {mode === "backend" && (
        <FarmListState resource={backendPlots} noun="farm plots" />
      )}
      {mode === "backend" && !online && (
        <p className="ui-notice" role="status">
          You’re offline. Refresh while connected before saving backend changes.
        </p>
      )}
      {message && (
        <p className="ui-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="ui-notice ui-error" role="alert">
          {error}
        </p>
      )}
      <div className="farm-grid">
        <section className="ui-panel">
          <h2>Your {mode === "simulation" ? "simulated " : ""}plots</h2>
          <ul className="farm-record-list">
            {plots.map((plot) => (
              <li key={plot.plot_id}>
                <button
                  className="ui-text-link"
                  aria-pressed={selectedPlotId === plot.plot_id}
                  onClick={() => {
                    selectPlot(plot.plot_id);
                    setDraft(null);
                    setError("");
                    setMessage("");
                  }}
                >
                  {plot.plot_name}
                </button>
                <p>
                  {plot.farm_name} ·{" "}
                  {plot.plot_size === null
                    ? "Size unavailable"
                    : `${plot.plot_size} hectares`}
                  {plot.plot_id === selectedPlotId ? " · Selected" : ""}
                </p>
              </li>
            ))}
          </ul>
          {!plots.length &&
            (mode === "simulation" ||
              (backendPlots.loaded && !backendPlots.error)) && (
              <p role="status">
                No plots yet. Create a plot before registering nodes.
              </p>
            )}
        </section>
        {draft ? (
          <form className="ui-panel ui-form farm-editor" onSubmit={save}>
            <h2 ref={heading} tabIndex={-1}>
              {draft.plot_id ? "Edit plot" : "Create plot"}
            </h2>
            <fieldset disabled={saving}>
              <legend className="sr-only">Plot details</legend>
              {[
                ["farm_name", "Farm name"],
                ["plot_name", "Plot name"],
              ].map(([key, label]) => (
                <label className="ui-field" htmlFor={key} key={key}>
                  {label}
                  <input
                    id={key}
                    required
                    maxLength={200}
                    value={draft[key]}
                    onChange={(e) =>
                      setDraft({ ...draft, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label className="ui-field" htmlFor="plot-size">
                Plot size (hectares)
                <input
                  id="plot-size"
                  required
                  type="number"
                  min="0.01"
                  max="999999.99"
                  step="0.01"
                  value={draft.plot_size}
                  onChange={(e) =>
                    setDraft({ ...draft, plot_size: e.target.value })
                  }
                />
              </label>
              <div className="farm-coordinate-grid">
                {[
                  ["latitude", "Latitude", 90],
                  ["longitude", "Longitude", 180],
                ].map(([key, label, limit]) => (
                  <label className="ui-field" htmlFor={key} key={key}>
                    {label}
                    <input
                      id={key}
                      required
                      type="number"
                      min={-limit}
                      max={limit}
                      step="any"
                      value={draft[key]}
                      onChange={(e) =>
                        setDraft({ ...draft, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="ui-muted">
                Coordinates identify a plot reference point. They are not a
                detected fruit location.
              </p>
              <div className="ui-actions">
                <button
                  className="ui-button primary"
                  type="submit"
                  disabled={unavailable}
                >
                  {saving ? "Saving…" : "Save plot"}
                </button>
                <button
                  className="ui-button"
                  type="button"
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
        ) : selected ? (
          <section className="ui-panel">
            <h2>{selected.plot_name}</h2>
            <dl className="farm-facts">
              <div>
                <dt>Farm</dt>
                <dd>{selected.farm_name}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>
                  {selected.plot_size === null
                    ? "Unavailable"
                    : `${selected.plot_size} hectares`}
                </dd>
              </div>
              <div>
                <dt>Plot reference · latitude / longitude</dt>
                <dd>
                  {selected.latitude ?? "Unavailable"},{" "}
                  {selected.longitude ?? "Unavailable"}
                </dd>
              </div>
            </dl>
            <div className="ui-actions">
              <button
                className="ui-button"
                disabled={saving || unavailable}
                onClick={() => edit(selected)}
              >
                Edit plot
              </button>
              <Link className="ui-button" to="/nodes">
                Manage selected plot’s nodes
              </Link>
            </div>
          </section>
        ) : (
          <p className="farm-empty">Select a plot to inspect or edit it.</p>
        )}
      </div>
    </>
  );
}
