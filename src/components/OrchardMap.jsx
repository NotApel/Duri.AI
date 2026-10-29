import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import { Link, useParams } from "react-router-dom";
import { fetchMapNodes } from "../services/farmApi";
import { nodeLocation } from "../services/nodeLocation";
import { farmDate } from "../services/farmData";
import Detections from "./Detections";
import "leaflet/dist/leaflet.css";
function FitNodes({ nodes }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      nodes.map((node) => node.position),
      { padding: [30, 30], maxZoom: 18 },
    );
  }, [map, nodes]);
  return null;
}
export default function OrchardMap() {
  const { eventId } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({
    nodes: [],
    loading: true,
    error: "",
    loaded: false,
  });
  useEffect(() => {
    if (eventId) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResult((previous) => ({ ...previous, loading: true, error: "" }));
      try {
        const nodes = await fetchMapNodes({ signal: controller.signal });
        if (!controller.signal.aborted)
          setResult({ nodes, loading: false, error: "", loaded: true });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult((previous) => ({
            ...previous,
            loading: false,
            error: error.message,
          }));
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [eventId, attempt]);
  const located = result.nodes
    .map((node) => ({
      ...node,
      position: nodeLocation(node.latitude, node.longitude),
    }))
    .filter((node) => node.position && node.location_recorded_at);
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
          aria-label="Reported node locations"
          className="map-panel ui-panel"
        >
          <div className="ui-actions">
            <button
              className="ui-button"
              disabled={result.loading}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Refresh node locations
            </button>
          </div>
          {result.loading && (
            <p className="ui-notice" role="status">
              Loading node locations…
            </p>
          )}
          {result.error && (
            <p className="ui-notice ui-error" role="alert">
              {result.error}{" "}
              {result.loaded ? "Displayed positions may be stale." : ""}{" "}
              <button
                className="ui-button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                Try again
              </button>
            </p>
          )}
          <p className="ui-notice">
            Pins show the latest location reported by each node, not an exact
            fallen-fruit position. Map tiles require internet access.
          </p>
          {located.length > 0 ? (
            <div className="orchard-map-canvas">
              <MapContainer
                center={located[0].position}
                zoom={17}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitNodes nodes={located} />
                {located.map((node) => (
                  <CircleMarker
                    key={node.node_id}
                    center={node.position}
                    radius={8}
                    pathOptions={{
                      color: "#37583a",
                      fillColor: node.is_active ? "#ffdc83" : "#b6b265",
                      fillOpacity: 1,
                    }}
                  >
                    <Popup>
                      <strong>{node.node_name}</strong>
                      <p>
                        {node.plot_name} ·{" "}
                        {node.is_active ? node.status : "Disabled"}
                      </p>
                      <p>
                        Location reported {farmDate(node.location_recorded_at)}
                      </p>
                      <Link to="/nodes">Manage nodes</Link>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          ) : (
            !result.loading &&
            !result.error && (
              <p className="farm-empty" role="status">
                No node locations have been reported. The map will appear when a
                configured device supplies coordinates.
              </p>
            )
          )}
          {result.loaded && (
            <p className="ui-muted">
              {located.length} located nodes ·{" "}
              {result.nodes.length - located.length} nodes without coordinates
            </p>
          )}
        </section>
      )}
      <Detections mode="map" />
    </div>
  );
}
