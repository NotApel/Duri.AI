import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDetectionPage } from "../services/detectionApi";
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
  const [cursors, setCursors] = useState([null]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({
    events: [],
    nextCursor: null,
    loading: true,
    loaded: false,
    error: "",
  });
  const cursor = cursors.at(-1);
  const activeKey = `${type}:${cursor || ""}`;
  const [resultKey, setResultKey] = useState("");
  const active = useRef(null);
  function refresh() {
    setAttempt((value) => value + 1);
  }
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(async () => {
      setResult((previous) => ({ ...previous, loading: true, error: "" }));
      try {
        const page = await fetchDetectionPage({
          cursor,
          prediction: type,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setResult({ ...page, loading: false, loaded: true, error: "" });
          setResultKey(activeKey);
        }
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
  }, [cursor, type, attempt, activeKey]);
  const samePage = resultKey === activeKey;
  const { loading, error: loadError, loaded, nextCursor } = result;
  const events = samePage ? result.events : [];
  const pageLoading = loading || (!samePage && !loadError);
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
          "Current page only. All times are Malaysia time (MYT).",
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
            Backend detection history · 20 records per page · exports include
            the current page · all times in Malaysia time (MYT)
          </span>
        </div>
      </div>
      <div className="d-filters log-toolbar">
        <label htmlFor="log-detection-type">
          Detection type
          <select
            id="log-detection-type"
            value={type}
            onChange={(event) => {
              active.current?.abort();
              setType(event.target.value);
              setCursors([null]);
            }}
          >
            <option value="">All types</option>
            <option value="DURIAN">Durian</option>
            <option value="NOT_DURIAN">Not durian</option>
          </select>
        </label>
        <button
          disabled={
            pageLoading || Boolean(loadError) || exporting || !events.length
          }
          onClick={() => exportLogs("csv")}
        >
          Export CSV
        </button>
        <button
          disabled={
            pageLoading || Boolean(loadError) || exporting || !events.length
          }
          onClick={() => exportLogs("pdf")}
        >
          {exporting ? "Preparing export…" : "Export PDF"}
        </button>
      </div>
      <button className="ui-button" disabled={pageLoading} onClick={refresh}>
        Refresh logs
      </button>
      {pageLoading && (
        <p className="ui-notice" role="status">
          Loading backend harvest logs…
        </p>
      )}
      {loadError && (
        <div className="ui-notice ui-error" role="alert">
          {loadError}
          {samePage && loaded ? " Displayed records may be stale." : ""}{" "}
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
        {loaded && !pageLoading && !loadError && !events.length && (
          <p className="p-6 text-center" role="status">
            {type
              ? "No detections match this type."
              : "No backend detections are available yet."}
          </p>
        )}
      </div>
      <nav className="ui-actions" aria-label="Harvest log pages">
        <button
          className="ui-button"
          disabled={pageLoading || cursors.length === 1}
          onClick={() => {
            active.current?.abort();
            setCursors((previous) => previous.slice(0, -1));
          }}
        >
          Previous page
        </button>
        <span aria-live="polite">Page {cursors.length}</span>
        <button
          className="ui-button"
          disabled={
            pageLoading || Boolean(loadError) || !samePage || !nextCursor
          }
          onClick={() => {
            active.current?.abort();
            setCursors((previous) => [...previous, nextCursor]);
          }}
        >
          Next page
        </button>
      </nav>
    </section>
  );
}
