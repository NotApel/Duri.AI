import { useState } from "react";
import { demoDetections } from "../data/demoDetections";
import "./Detections.css";

const timeZone = "Asia/Kuala_Lumpur";
const detectionType = (event) => {
  if (event.prediction === "Durian") return "Durian";
  if (event.prediction === "Not durian") return "Non-durian";
  return event.status === "FAILED" ? "Unknown" : "Awaiting verification";
};
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
  // Logs depend on event fixtures only. Unavailable/corrupt feedback storage
  // must never prevent read-only event history from rendering.
  const events = demoDetections.filter(
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
        doc.text("Duri.AI - SIMULATED harvest logs", 14, 18);
        doc.setFontSize(10);
        doc.text(
          "Sample events only. All times are Malaysia time (MYT).",
          14,
          26,
        );
        autoTable(doc, { startY: 33, head: [headers], body: rows });
        doc.save("DuriAI_Simulation_Logs.pdf");
      } else {
        const content = [headers, ...rows]
          .map((row) =>
            row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
          )
          .join("\r\n");
        const url = URL.createObjectURL(
          new Blob([content], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "DuriAI_Simulation_Logs.csv";
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
          <strong>Simulation mode</strong>
          <span>
            Sample events only · no live hardware connected · all times in
            Malaysia time (MYT)
          </span>
        </div>
      </div>
      <div className="d-filters log-toolbar">
        <label>
          Detection type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All types</option>
            {[...new Set(demoDetections.map(detectionType))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          disabled={exporting || !events.length}
          onClick={() => exportLogs("csv")}
        >
          Export CSV
        </button>
        <button
          disabled={exporting || !events.length}
          onClick={() => exportLogs("pdf")}
        >
          {exporting ? "Preparing export…" : "Export PDF"}
        </button>
      </div>
      {error && (
        <p className="d-error" role="alert">
          {error}
        </p>
      )}
      <div className="ui-table-wrap">
        <table className="ui-table">
          <caption className="sr-only">
            Simulated harvest logs. Dates and times use Malaysia time.
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
                  <td key={column}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!events.length && (
          <p className="p-6 text-center" role="status">
            No detections match this type.
          </p>
        )}
      </div>
    </section>
  );
}
