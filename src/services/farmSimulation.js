import { plotPayload, nodePayload } from "./farmData.js";
const validTime = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const validId = (value) =>
  typeof value === "string" && /^SIM-[A-Z]+-[a-f0-9-]{36}$/.test(value);
export const emptyFarm = () => ({
  version: 1,
  plots: [],
  nodes: [],
  notifications: [],
  events: [],
  selectedPlotId: "",
});
export const farmStorageKey = (farmerId) =>
  `duriai.farm-simulation.v1.${farmerId}`;
export function validateFarm(value) {
  if (
    !value ||
    value.version !== 1 ||
    !["plots", "nodes", "notifications", "events"].every((key) =>
      Array.isArray(value[key]),
    ) ||
    typeof value.selectedPlotId !== "string"
  )
    throw new Error("Invalid saved farm simulation.");
  for (const [key, idKey] of [
    ["plots", "plot_id"],
    ["nodes", "node_id"],
    ["notifications", "notification_id"],
    ["events", "id"],
  ]) {
    const ids = value[key].map((row) => row?.[idKey]);
    if (ids.some((id) => !validId(id)) || new Set(ids).size !== ids.length)
      throw new Error("Invalid saved simulation IDs.");
  }
  for (const plot of value.plots) plotPayload(plot);
  const plotIds = new Set(value.plots.map((p) => p.plot_id));
  const names = new Set();
  for (const node of value.nodes) {
    const payload = nodePayload(node);
    const name = payload.node_name.toLowerCase();
    if (
      !plotIds.has(node.plot_id) ||
      names.has(name) ||
      !["ONLINE", "OFFLINE"].includes(node.status) ||
      node.battery_level !== null ||
      (node.last_ping_at !== null && !validTime(node.last_ping_at))
    )
      throw new Error("Invalid saved simulation nodes.");
    names.add(name);
  }
  for (const event of value.events) {
    if (
      !value.nodes.some((n) => n.node_id === event.node_id) ||
      !plotIds.has(event.plot_id) ||
      !validTime(event.time) ||
      typeof event.node !== "string" ||
      typeof event.plot_name !== "string" ||
      event.status !== "PENDING" ||
      ["prediction", "confidence", "amplitude", "frequency", "duration"].some(
        (key) => event[key] !== null,
      )
    )
      throw new Error("Invalid saved simulation event.");
  }
  for (const notification of value.notifications) {
    if (
      !value.events.some((e) => e.id === notification.detection_id) ||
      typeof notification.is_read !== "boolean" ||
      typeof notification.title !== "string" ||
      typeof notification.message_noti !== "string" ||
      !validTime(notification.created_at)
    )
      throw new Error("Invalid saved simulation notifications.");
  }
  if (value.selectedPlotId && !plotIds.has(value.selectedPlotId))
    throw new Error("Invalid selected plot.");
  return value;
}
export function updateFarm(state, action) {
  const { type, id, draft, now } = action;
  if (type === "selectPlot") {
    if (id && !state.plots.some((p) => p.plot_id === id))
      throw new Error("Select an existing plot.");
    return { ...state, selectedPlotId: id };
  }
  if (type === "savePlot") {
    const payload = plotPayload(draft);
    if (!validId(id)) throw new Error("Invalid simulation plot ID.");
    const plot = { ...payload, plot_id: id };
    return {
      ...state,
      plots: state.plots.some((p) => p.plot_id === id)
        ? state.plots.map((p) => (p.plot_id === id ? plot : p))
        : [...state.plots, plot],
      selectedPlotId: id,
    };
  }
  if (type === "saveNode") {
    const payload = nodePayload(draft);
    if (!validId(id) || !state.plots.some((p) => p.plot_id === payload.plot_id))
      throw new Error("Select an existing plot before registering a node.");
    if (
      state.nodes.some(
        (n) =>
          n.node_id !== id &&
          n.node_name.toLowerCase() === payload.node_name.toLowerCase(),
      )
    )
      throw new Error("This node name is already registered.");
    const previous = state.nodes.find((n) => n.node_id === id);
    if (
      previous &&
      previous.plot_id !== payload.plot_id &&
      state.events.some((e) => e.node_id === id)
    )
      throw new Error(
        "This node has event history. Keep its plot assignment to preserve that history.",
      );
    const node = {
      node_id: id,
      status: "OFFLINE",
      battery_level: null,
      last_ping_at: null,
      ...previous,
      ...payload,
    };
    return {
      ...state,
      nodes: previous
        ? state.nodes.map((n) => (n.node_id === id ? node : n))
        : [...state.nodes, node],
    };
  }
  if (type === "connection") {
    if (
      !state.nodes.some((n) => n.node_id === id) ||
      !["ONLINE", "OFFLINE"].includes(action.status) ||
      !validTime(now)
    )
      throw new Error("Invalid simulated connection update.");
    return {
      ...state,
      nodes: state.nodes.map((n) =>
        n.node_id === id
          ? {
              ...n,
              status: action.status,
              last_ping_at: action.status === "ONLINE" ? now : n.last_ping_at,
            }
          : n,
      ),
    };
  }
  if (type === "candidate") {
    const node = state.nodes.find((n) => n.node_id === id);
    if (
      !node ||
      !validTime(now) ||
      !validId(action.eventId) ||
      !validId(action.notificationId)
    )
      throw new Error("Select a registered simulation node.");
    const event = {
      id: action.eventId,
      node_id: id,
      node: node.node_name,
      plot_id: node.plot_id,
      plot_name: state.plots.find((p) => p.plot_id === node.plot_id).plot_name,
      time: now,
      status: "PENDING",
      prediction: null,
      confidence: null,
      amplitude: null,
      frequency: null,
      duration: null,
    };
    const notification = {
      notification_id: action.notificationId,
      detection_id: event.id,
      title: "Simulated candidate needs review",
      message_noti: `A simulated event was created for ${node.node_name}. No camera evidence or confirmed harvest is available.`,
      created_at: now,
      is_read: false,
    };
    return {
      ...state,
      events: [event, ...state.events],
      notifications: [notification, ...state.notifications],
    };
  }
  if (type === "markRead") {
    if (!state.notifications.some((n) => n.notification_id === id))
      throw new Error("This notification no longer exists.");
    return {
      ...state,
      notifications: state.notifications.map((n) =>
        n.notification_id === id ? { ...n, is_read: true } : n,
      ),
    };
  }
  throw new Error("Unsupported farm simulation action.");
}
