import { useEffect, useState } from "react";
import { fetchAlerts } from "../services/api";
import { detectionType } from "../services/detectionData";
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
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetchAlerts({ signal: controller.signal })
      .then((data) => {
        setRecords(data);
        setLoadError("");
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoadError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
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
        doc.text("Duri.AI - harvest logs", 14, 18);
        doc.setFontSize(10);
        doc.text("Backend records. All times are Malaysia time (MYT).", 14, 26);
        autoTable(doc, { startY: 33, head: [headers], body: rows });
        doc.save("DuriAI_Harvest_Logs.pdf");
      } else {
        const content = [headers, ...rows]
          .map((row) =>
            row
              .map((value) => {
                const safe = /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
                return `"${safe.replaceAll('"', '""')}"`;
              })
              .join(","),
          )
          .join("\r\n");
        const url = URL.createObjectURL(
          new Blob([content], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "DuriAI_Harvest_Logs.csv";
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
            Same detection source as Orchard Map · all times in Malaysia time
            (MYT)
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
      {error && (
        <p className="d-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="ui-notice" role="status">
          Loading harvest logs…
        </p>
      )}
      {loadError && (
        <div className="ui-notice ui-error" role="alert">
          {loadError}{" "}
          <button
            className="ui-button"
            onClick={() => {
              setLoading(true);
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
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
                  <td key={column}>{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !loadError && !events.length && (
          <p className="p-6 text-center" role="status">
            No detections match this type.
          </p>
        )}
      </div>
    </section>
  );
}
