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
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-emerald-950">Orchard Map</h1>
        <p className="mt-2 text-sm text-slate-700">
          Review detections and farmer feedback alongside your orchard view.
        </p>
      </header>
      {!eventId && (
        <section aria-label="Illustrative orchard map" className="space-y-3">
          <p className="rounded-lg border border-amber-800/20 bg-amber-50 p-3 text-sm text-amber-950">
            <strong>Illustrative map only.</strong> Existing sample boundaries
            and pins are not measured device locations. Detection events below
            have no GPS and are not plotted. Map tiles require an internet
            connection.
          </p>
          <div className="h-[38vh] min-h-64 overflow-hidden rounded-2xl border border-emerald-900/20 relative z-0">
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
                pathOptions={{ color: "#204d36", fillOpacity: 0.12 }}
              />
              {SAMPLE_NODES.map((node) => (
                <CircleMarker
                  key={node.id}
                  center={node.position}
                  radius={8}
                  pathOptions={{
                    color: "#204d36",
                    fillColor: "#c4d890",
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
