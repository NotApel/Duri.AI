import { useState } from "react";
import { Link } from "react-router-dom";
import { useDetections } from "../services/DetectionContext";
import { csvCell, detectionType } from "../services/detectionData";
import "./Detections.css";

const timeZone = "Asia/Kuala_Lumpur";
const eventDate = (value) =>
  new Date(value).toLocaleDateString("en-MY", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
const eventTime = (value) =>
  new Date(value).toLocaleTimeString("en-MY", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

export default function HarvestAnalytics() {
  const [type, setType] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const {
    events: records,
    loading,
    error: loadError,
    refresh,
    loaded,
  } = useDetections();
  const events = records.filter(
    (event) => !type || detectionType(event) === type,
  );
  const rows = events.map((event) => [
    eventDate(event.time),
    eventTime(event.time),
    detectionType(event),
    event.node,
  ]);
  const headers = ["Date", "Time (MYT)", "Detection type", "Node"];
  async function exportLogs(format) {
    setExporting(true);
    setError("");
    try {
      if (format === "pdf") {
        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
          import("jspdf"),
          import("jspdf-autotable"),
        ]);
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text("Duri.AI - backend harvest logs", 14, 18);
        doc.setFontSize(10);
        doc.text(
          "Latest API records. All times are Malaysia time (MYT).",
          14,
          26,
        );
        autoTable(doc, { startY: 33, head: [headers], body: rows });
        doc.save("DuriAI_Backend_Logs.pdf");
      } else {
        const content = [headers, ...rows]
          .map((row) => row.map(csvCell).join(","))
          .join("\r\n");
        const url = URL.createObjectURL(
          new Blob([content], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "DuriAI_Backend_Logs.csv";
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setError(
        "The export could not be created. Please try again. The logs are still available below.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="detections ui-page">
      <header>
        <h1>Harvest Logs</h1>
        <p className="mt-2 text-sm ui-muted">
          Detection records by date, time, detection type, and sensor node.
        </p>
      </header>
      <div className="d-demo">
        <div>
          <strong>Backend records</strong>
          <span>
            Same records as Orchard Map · latest API results, currently up to
            ten · all times in Malaysia time (MYT)
          </span>
        </div>
      </div>
      <div className="d-filters log-toolbar">
        <label htmlFor="log-detection-type">
          Detection type
          <select
            id="log-detection-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All types</option>
            {[...new Set(records.map(detectionType))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          disabled={
            loading || Boolean(loadError) || exporting || !events.length
          }
          onClick={() => exportLogs("csv")}
        >
          Export CSV
        </button>
        <button
          disabled={
            loading || Boolean(loadError) || exporting || !events.length
          }
          onClick={() => exportLogs("pdf")}
        >
          {exporting ? "Preparing export…" : "Export PDF"}
        </button>
      </div>
      <button className="ui-button" disabled={loading} onClick={refresh}>
        Refresh logs
      </button>
      {loading && (
        <p className="ui-notice" role="status">
          Loading backend harvest logs…
        </p>
      )}
      {loadError && (
        <div className="ui-notice ui-error" role="alert">
          {loadError}
          {loaded ? " Displayed records may be stale." : ""}{" "}
          <button className="ui-button" onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      {error && (
        <p className="d-error" role="alert">
          {error}
        </p>
      )}
      <div className="ui-table-wrap">
        <table className="ui-table">
          <caption className="sr-only">
            Backend harvest logs. Dates and times use Malaysia time.
          </caption>
          <thead>
            <tr>
              {["Date", "Time (MYT)", "Detection type", "Node"].map((title) => (
                <th scope="col" key={title}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={event.id}>
                {rows[index].map((value, column) => (
                  <td key={column}>
                    {column === 0 ? (
                      <Link
                        className="ui-text-link"
                        to={`/map/events/${encodeURIComponent(event.id)}`}
                        aria-label={`View event ${event.id} on ${value}`}
                      >
                        {value}
                      </Link>
                    ) : (
                      value
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && !loading && !loadError && !events.length && (
          <p className="p-6 text-center" role="status">
            {records.length
              ? "No detections match this type."
              : "No backend detections are available yet."}
          </p>
        )}
      </div>
    </section>
  );
}
