import { Link, useParams } from "react-router-dom";
import { useFarm } from "../services/FarmContext";
import { farmDate } from "../services/farmData";
import "./FarmManagement.css";
export default function SimulationEventDetails() {
  const { eventId } = useParams();
  const { state, error } = useFarm();
  const event = state.events.find((row) => row.id === eventId);
  return (
    <section className="ui-page farm-management">
      <header>
        <h1>Orchard Map</h1>
        <p className="ui-muted">Simulated detection details</p>
      </header>
      <p className="ui-notice">
        Browser simulation only. This candidate is separate from backend
        detections and Harvest Logs. No device location, camera image, measured
        vibration or model prediction is available.
      </p>
      <Link className="ui-text-link" to="/notifications">
        Back to notifications
      </Link>
      {error && (
        <p className="ui-notice ui-error" role="alert">
          {error}
        </p>
      )}
      {event ? (
        <article className="ui-panel">
          <h2>Simulated candidate · awaiting verification</h2>
          <dl className="farm-facts">
            <div>
              <dt>Event ID</dt>
              <dd>{event.id}</dd>
            </div>
            <div>
              <dt>Sensor node · simulation</dt>
              <dd>{event.node}</dd>
            </div>
            <div>
              <dt>Plot at event creation</dt>
              <dd>{event.plot_name}</dd>
            </div>
            <div>
              <dt>Event time · MYT</dt>
              <dd>{farmDate(event.time)}</dd>
            </div>
            <div>
              <dt>Location, camera and measurements</dt>
              <dd>Unavailable</dd>
            </div>
          </dl>
          <p>
            This is a candidate, not a confirmed harvest. No farmer feedback or
            training job has been submitted to the backend.
          </p>
        </article>
      ) : (
        <div className="ui-panel">
          <h2>Simulation event unavailable</h2>
          <p>
            The event may have been reset or belong to another browser session
            or account.
          </p>
        </div>
      )}
    </section>
  );
}
