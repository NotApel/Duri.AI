import { useFarm } from "../services/FarmContext";
export function FarmPlotPicker({ onChange }) {
  const { plots, selectedPlotId, selectPlot } = useFarm();
  return (
    <label className="ui-field" htmlFor="farm-selected-plot">
      Selected farm plot
      <select
        id="farm-selected-plot"
        value={selectedPlotId}
        onChange={(e) => {
          selectPlot(e.target.value);
          onChange?.();
        }}
      >
        <option value="">Select a plot</option>
        {plots.map((plot) => (
          <option key={plot.plot_id} value={plot.plot_id}>
            {plot.farm_name} · {plot.plot_name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function FarmListState({ resource, noun }) {
  return (
    <>
      {resource.loading && (
        <p role="status" className="ui-notice">
          Loading {noun}…
        </p>
      )}
      {resource.error && (
        <div role="alert" className="ui-notice ui-error">
          {resource.error}{" "}
          {resource.loaded ? "Displayed records may be stale." : ""}{" "}
          <button className="ui-button" onClick={resource.refresh}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}
