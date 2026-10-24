import { recordId, measurement } from "./detectionData.js";

const text = (value, label, maximum, optional = false) => {
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.trim().length > maximum
  )
    throw new Error(
      `${label} must contain ${optional ? "0" : "1"}–${maximum} characters.`,
    );
  return value.trim();
};
const coordinate = (value, limit, label) => {
  if (
    !["number", "string"].includes(typeof value) ||
    String(value).trim() === "" ||
    !Number.isFinite(Number(value)) ||
    Math.abs(Number(value)) > limit
  )
    throw new Error(`Enter ${label} between −${limit} and ${limit}.`);
  return Number(value);
};
export function plotPayload(draft) {
  const size = measurement(draft.plot_size, 999999.99);
  if (size === null || size <= 0)
    throw new Error(
      "Plot size must be greater than zero and no more than 999,999.99 hectares.",
    );
  return {
    farm_name: text(draft.farm_name, "Farm name", 200),
    plot_name: text(draft.plot_name, "Plot name", 200),
    plot_size: size,
    latitude: coordinate(draft.latitude, 90, "latitude"),
    longitude: coordinate(draft.longitude, 180, "longitude"),
  };
}
export function nodePayload(draft) {
  if (typeof draft.plot_id !== "string" || !draft.plot_id)
    throw new Error("Select a farm plot.");
  return {
    plot_id: draft.plot_id,
    node_name: text(draft.node_name, "Node name", 50),
    firmware_version:
      text(draft.firmware_version ?? "", "Firmware version", 20, true) || null,
  };
}
function list(rows, kind, transform) {
  if (!Array.isArray(rows))
    throw new Error(`The server returned an invalid ${kind} list.`);
  const ids = new Set();
  return rows.map((row) => {
    const id = recordId(row?.[`${kind}_id`]);
    if (!id || ids.has(id))
      throw new Error(`A ${kind} record has an invalid or duplicate ID.`);
    ids.add(id);
    return transform(row, id);
  });
}
export function normalizePlots(rows, farmerId) {
  return list(rows, "plot", (row, id) => {
    if (String(row.farmer_id) !== String(farmerId))
      throw new Error(
        "The backend returned a plot belonging to another farmer.",
      );
    return {
      plot_id: id,
      farmer_id: String(row.farmer_id),
      farm_name: text(row.farm_name, "Farm name", 200),
      plot_name: text(row.plot_name, "Plot name", 200),
      plot_size: measurement(row.plot_size, 999999.99),
      latitude: optionalCoordinate(row.latitude, 90),
      longitude: optionalCoordinate(row.longitude, 180),
    };
  });
}
function optionalCoordinate(value, limit) {
  try {
    return coordinate(value, limit, "coordinate");
  } catch {
    return null;
  }
}
export function normalizeNodes(rows, plotId) {
  return list(rows, "node", (row, id) => {
    if (String(row.plot_id) !== plotId)
      throw new Error("The backend returned a node assigned to another plot.");
    return {
      node_id: id,
      plot_id: plotId,
      node_name: text(row.node_name, "Node name", 50),
      firmware_version:
        typeof row.firmware_version === "string" ? row.firmware_version : null,
      status: ["ONLINE", "OFFLINE"].includes(row.status)
        ? row.status
        : "UNKNOWN",
      battery_level: measurement(row.battery_level, 100),
      last_ping_at:
        typeof row.last_ping_at === "string" &&
        Number.isFinite(Date.parse(row.last_ping_at))
          ? row.last_ping_at
          : null,
    };
  });
}
export function normalizeNotifications(rows, farmerId) {
  return list(rows, "notification", (row, id) => {
    if (!recordId(row.farmer_id) || typeof row.is_read !== "boolean")
      throw new Error(
        "The backend returned an invalid notification owner or read state.",
      );
    return {
      notification_id: id,
      farmer_id: String(row.farmer_id),
      detection_id: recordId(row.detection_id),
      title:
        typeof row.title === "string" && row.title.trim()
          ? row.title
          : "Detection notification",
      message_noti:
        typeof row.message_noti === "string"
          ? row.message_noti
          : "No message supplied.",
      is_read: row.is_read,
      created_at:
        typeof row.created_at === "string" &&
        Number.isFinite(Date.parse(row.created_at))
          ? row.created_at
          : null,
    };
  }).filter((row) => row.farmer_id === String(farmerId));
}
export function farmDate(value) {
  return value
    ? new Date(value).toLocaleString("en-MY", {
        timeZone: "Asia/Kuala_Lumpur",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Unavailable";
}
