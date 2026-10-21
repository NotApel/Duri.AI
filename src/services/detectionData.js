const measurement = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
export function normalizeDetections(rows) {
  if (!Array.isArray(rows))
    throw new Error("The server returned an invalid detection list.");
  return rows.map((row) => {
    if (
      row.detection_id == null ||
      !Number.isFinite(Date.parse(row.detection_at))
    )
      throw new Error("A detection has an invalid ID or timestamp.");
    return {
      id: String(row.detection_id),
      node:
        typeof row.node_name === "string" && row.node_name.trim()
          ? row.node_name
          : "Unavailable",
      time: row.detection_at,
      status:
        typeof row.detection_status === "string"
          ? row.detection_status
          : "FAILED",
      prediction:
        row.prediction === "DURIAN"
          ? "Durian"
          : row.prediction === "NOT_DURIAN"
            ? "Not durian"
            : null,
      confidence: measurement(row.confidence),
      amplitude: measurement(row.amplitude),
      frequency: measurement(row.frequency),
      duration: measurement(row.duration),
      camera:
        "Backend detection record. Camera image and GPS were not provided.",
    };
  });
}
export function detectionType(event) {
  return (
    event.prediction ||
    (event.status === "FAILED" ? "Unknown" : "Awaiting verification")
  );
}
