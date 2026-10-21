import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Polygon,
} from "react-leaflet";
import { useParams } from "react-router-dom";
import Detections from "./Detections";
import "leaflet/dist/leaflet.css";

// Existing illustrative map geometry only; these are not event/device GPS fixes.
const ORCHARD_CENTER = [2.9310862705353444, 101.79819826037814];
const PLOT_BOUNDARY = [
  [2.9312, 101.7981],
  [2.9312, 101.7983],
  [2.93099, 101.7983],
  [2.93099, 101.7981],
];
const SAMPLE_NODES = [
  { id: "NODE-01", position: [2.931092, 101.798196] },
  { id: "NODE-02", position: [2.931086, 101.7982] },
  { id: "NODE-03", position: [2.93108, 101.798197] },
];
export default function OrchardMap() {
  const { eventId } = useParams();
  return (
    <div className={`ui-page orchard-grid${eventId ? " orchard-detail" : ""}`}>
      <header className="orchard-header">
        <h1>Orchard Map</h1>
        <p className="mt-2 text-sm ui-muted">
          Review detections and farmer feedback alongside your orchard view.
        </p>
      </header>
      {!eventId && (
        <section
          aria-label="Illustrative orchard map"
          className="map-panel ui-panel"
        >
          <p className="ui-notice">
            <strong>Illustrative map only.</strong> Existing sample boundaries
            and pins are not measured device locations. Detection events have no
            GPS and are not plotted. Map tiles require an internet connection.
          </p>
          <div className="orchard-map-canvas">
            <MapContainer
              center={ORCHARD_CENTER}
              zoom={20}
              maxZoom={22}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polygon
                positions={PLOT_BOUNDARY}
                pathOptions={{ color: "#37583a", fillOpacity: 0.12 }}
              />
              {SAMPLE_NODES.map((node) => (
                <CircleMarker
                  key={node.id}
                  center={node.position}
                  radius={8}
                  pathOptions={{
                    color: "#37583a",
                    fillColor: "#ffdc83",
                    fillOpacity: 1,
                  }}
                >
                  <Popup>
                    <strong>{node.id} · sample pin</strong>
                    <p>
                      Illustrative position only. No live device or detection is
                      associated with this pin.
                    </p>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </section>
      )}
      <Detections mode="map" />
    </div>
  );
}
