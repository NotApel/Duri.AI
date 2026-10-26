import { Link } from "react-router-dom";
import { useFarm } from "../services/FarmContext";
import PlotManagement from "./PlotManagement";
import NodeManagement from "./NodeManagement";
import Notifications from "./Notifications";
import "./FarmManagement.css";
const pages = {
  plots: ["Farm plots", PlotManagement],
  nodes: ["Node Status", NodeManagement],
  notifications: ["Notifications", Notifications],
};
export default function FarmManagement({ page }) {
  const { mode, setMode, dispatch, error, revision } = useFarm();
  const [title, Component] = pages[page];
  return (
    <section className="ui-page farm-management">
      <header className="ui-page-header">
        <h1>{title}</h1>
        <div className="ui-actions">
          {page !== "plots" && (
            <Link className="ui-button" to="/plots">
              Manage plots
            </Link>
          )}
          {page !== "nodes" && (
            <Link className="ui-button" to="/nodes">
              Manage nodes
            </Link>
          )}
          {page !== "notifications" && (
            <Link className="ui-button" to="/notifications">
              Notifications
            </Link>
          )}
        </div>
      </header>
      <div className="farm-source">
        <label className="ui-field" htmlFor="farm-source">
          Management data source
          <select
            id="farm-source"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="simulation">Browser simulation</option>
            <option value="backend">Backend records</option>
          </select>
        </label>
        <p className="ui-notice">
          {mode === "simulation"
            ? "Simulation · saved only in this browser for your account. No hardware is contacted. Regular detections and Harvest Logs remain on backend data."
            : "Backend records · changes save after server confirmation. Node connection, battery and locations come from device reports."}
        </p>
        {mode === "simulation" && (
          <button
            className="ui-button"
            onClick={() => {
              if (
                window.confirm(
                  "Reset this account’s simulated plots, nodes, candidate events and notifications? Backend records are not affected.",
                )
              )
                dispatch({ type: "reset" });
            }}
          >
            Reset farm simulation
          </button>
        )}
      </div>
      {mode === "simulation" && error && (
        <p className="ui-notice ui-error" role="alert">
          {error}
        </p>
      )}
      <Component key={`${mode}:${revision}`} />
    </section>
  );
}
