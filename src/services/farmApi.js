import { apiRequest } from "./api";
import { recordId } from "./detectionData.js";
import {
  nodePayload,
  plotPayload,
  normalizeNodes,
  normalizePlots,
  normalizeNotifications,
} from "./farmData.js";
export async function farmRequest(path, options = {}) {
  try {
    const timeout = AbortSignal.timeout(15000);
    return await apiRequest(path, {
      ...options,
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    });
  } catch (error) {
    if ([404, 405, 501].includes(error.status))
      throw new Error(
        "This operation is not available on the current backend. Your changes were not saved. Use Browser simulation to preview it; see the backend setup guide for implementation.",
        { cause: error },
      );
    throw error;
  }
}
export async function readFarmList(kind, id, options) {
  if (!recordId(id)) throw new Error("Select an available farmer or plot.");
  const paths = {
    plots: `/farmers/${id}/plots`,
    nodes: `/plots/${id}/nodes`,
    notifications: "/notifications",
  };
  const normalize = {
    plots: normalizePlots,
    nodes: normalizeNodes,
    notifications: normalizeNotifications,
  };
  return normalize[kind](await farmRequest(paths[kind], options), id);
}
const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export async function saveBackendPlot(farmerId, draft) {
  if (!recordId(farmerId) || (draft.plot_id && !recordId(draft.plot_id)))
    throw new Error("Invalid farmer or plot ID.");
  const payload = plotPayload(draft);
  // Existing main's create handler checks coordinate truthiness. Preserve valid 0.
  payload.latitude = String(payload.latitude);
  payload.longitude = String(payload.longitude);
  const result = await farmRequest(
    draft.plot_id ? `/plots/${draft.plot_id}` : `/farmers/${farmerId}/plots`,
    json(draft.plot_id ? "PATCH" : "POST", payload),
  );
  const [plot] = normalizePlots([result], farmerId);
  if (draft.plot_id && plot.plot_id !== draft.plot_id)
    throw new Error(
      "The server did not confirm the edited plot. Refresh before retrying.",
    );
  return plot;
}
export async function saveBackendNode(draft) {
  const payload = nodePayload(draft);
  if (!recordId(payload.plot_id) || (draft.node_id && !recordId(draft.node_id)))
    throw new Error("Invalid node or plot ID.");
  const result = await farmRequest(
    draft.node_id
      ? `/nodes/${draft.node_id}`
      : `/plots/${payload.plot_id}/nodes`,
    json(draft.node_id ? "PATCH" : "POST", payload),
  );
  const [node] = normalizeNodes([result], payload.plot_id);
  if (draft.node_id && node.node_id !== draft.node_id)
    throw new Error(
      "The server did not confirm the edited node. Refresh before retrying.",
    );
  return node;
}
export async function markBackendRead(id, farmerId) {
  if (!recordId(id)) throw new Error("Invalid notification ID.");
  const result = await farmRequest(`/notifications/${id}/read`, {
    method: "PATCH",
  });
  const [notification] = normalizeNotifications([result], farmerId);
  if (
    !notification ||
    notification.notification_id !== id ||
    !notification.is_read
  )
    throw new Error(
      "The server did not confirm the read state. Refresh before retrying.",
    );
  return notification;
}
