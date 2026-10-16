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
  ]);
  const headers = ["Date", "Time (MYT)", "Detection type"];
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
    <section className="detections space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-emerald-950">Harvest Logs</h1>
        <p className="mt-2 text-sm text-slate-700">
          Detection records by date, time, and type.
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
      <div className="d-filters">
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
      <div className="overflow-x-auto rounded-xl border border-emerald-900/20 bg-amber-50">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Simulated harvest logs. Dates and times use Malaysia time.
          </caption>
          <thead className="bg-emerald-900 text-white">
            <tr>
              {["Date", "Time (MYT)", "Detection type"].map((title) => (
                <th scope="col" className="p-3 sm:p-4" key={title}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr className="border-t border-emerald-900/15" key={event.id}>
                {rows[index].map((value, column) => (
                  <td className="p-3 sm:p-4" key={column}>
                    {value}
                  </td>
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
