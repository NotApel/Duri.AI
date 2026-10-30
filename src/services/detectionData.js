import { nodeLocation } from "./nodeLocation.js";
const idPattern = /^[1-9]\d*$/;
export function recordId(value) {
  const id = String(value ?? "");
  return idPattern.test(id) ? id : null;
}
export function measurement(value, maximum = Infinity) {
  if (
    !["number", "string"].includes(typeof value) ||
    String(value).trim() === ""
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= maximum
    ? number
    : null;
}
const statuses = new Set([
  "PENDING",
  "VERIFYING",
  "VERIFIED",
  "REJECTED",
  "FAILED",
]);
export function normalizeDetections(rows) {
  if (!Array.isArray(rows))
    throw new Error("The server returned an invalid detection list.");
  const ids = new Set();
  return rows.map((row) => {
    const id = recordId(row?.detection_id);
    if (
      !id ||
      ids.has(id) ||
      typeof row.detection_at !== "string" ||
      !Number.isFinite(Date.parse(row.detection_at))
    )
      throw new Error(
        "A detection has an invalid ID or timestamp. Please refresh or contact the backend developer.",
      );
    ids.add(id);
    return {
      id,
      simulation: row.is_simulation === true,
      nodeId: recordId(row.node_id),
      plotId: recordId(row.plot_id),
      location: nodeLocation(row.node_latitude, row.node_longitude),
      locationRecordedAt:
        typeof row.location_recorded_at === "string" &&
        Number.isFinite(Date.parse(row.location_recorded_at))
          ? row.location_recorded_at
          : null,
      feedback: normalizeFeedback(row.farmer_feedback, row.detection_at),
      node:
        typeof row.node_name === "string" && row.node_name.trim()
          ? row.node_name
          : "Unavailable",
      time: row.detection_at,
      status: statuses.has(row.detection_status)
        ? row.detection_status
        : "UNKNOWN",
      prediction:
        row.prediction === "DURIAN"
          ? "Durian"
          : row.prediction === "NOT_DURIAN"
            ? "Not durian"
            : null,
      confidence: measurement(row.confidence, 100),
      amplitude: measurement(row.amplitude),
      amplitudeUnit: ["g", "m/s²"].includes(row.amplitude_unit)
        ? row.amplitude_unit
        : null,
      frequency: measurement(row.frequency),
      duration: measurement(row.duration),
      images: Array.isArray(row.images) ? row.images : null,
    };
  });
}
function normalizeFeedback(row, eventTime) {
  if (
    !row ||
    !recordId(row.feedback_id) ||
    typeof row.correct_detection !== "boolean" ||
    !Number.isFinite(Date.parse(row.feedback_at))
  )
    return null;
  return {
    feedbackId: String(row.feedback_id),
    label: row.correct_detection ? "DURIAN" : "NOT_DURIAN",
    categoryId: recordId(row.category_id),
    category: row.category_name || "No category supplied",
    comment: typeof row.comment_farmer === "string" ? row.comment_farmer : "",
    savedAt: row.feedback_at,
    eventTime,
  };
}
export function detectionType(event) {
  const type =
    event.prediction ||
    (["PENDING", "VERIFYING"].includes(event.status)
      ? "Awaiting verification"
      : "Unknown");
  return event.simulation ? `${type} (simulated)` : type;
}
export function normalizeCategories(rows) {
  if (!Array.isArray(rows))
    throw new Error("The server returned an invalid category list.");
  const ids = new Set();
  return rows.map((row) => {
    const id = recordId(row?.category_id);
    if (
      !id ||
      ids.has(id) ||
      typeof row.category_name !== "string" ||
      !row.category_name.trim()
    )
      throw new Error(
        "A feedback category is invalid. Please contact the backend developer.",
      );
    ids.add(id);
    return { id, name: row.category_name };
  });
}
export function feedbackPayload({ farmerId, label, categoryId, comment }) {
  if (!recordId(farmerId))
    throw new Error("Please log in again before submitting feedback.");
  if (!["DURIAN", "NOT_DURIAN"].includes(label))
    throw new Error("Choose Durian or No Durian.");
  const hasCategory =
    categoryId !== undefined && categoryId !== null && categoryId !== "";
  if (
    (label === "NOT_DURIAN" && !hasCategory) ||
    (hasCategory && !recordId(categoryId))
  )
    throw new Error("Choose an available feedback category for No Durian.");
  if (typeof comment !== "string" || comment.length > 500)
    throw new Error("Comments can contain up to 500 characters.");
  // The active main endpoint maps true → VERIFIED, false → REJECTED. This
  // legacy field represents the farmer's class, not agreement with a prediction.
  return {
    farmer_id: String(farmerId),
    category_id: hasCategory ? String(categoryId) : null,
    correct_detection: label === "DURIAN",
    comment_farmer: comment.trim() || null,
  };
}
export function csvCell(value) {
  const text = String(value ?? "");
  const safe =
    /^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
