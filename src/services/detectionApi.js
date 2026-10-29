import { apiRequest } from "./api";
import {
  feedbackPayload,
  normalizeCategories,
  normalizeDetections,
  recordId,
} from "./detectionData";
function read(path, { signal } = {}) {
  const timeout = AbortSignal.timeout(15000);
  return apiRequest(path, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}
export async function fetchDetectionPage({
  cursor,
  prediction = "",
  signal,
} = {}) {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  if (prediction) query.set("prediction", prediction);
  const result = await read(`/detections?${query}`, { signal });
  if (
    !result ||
    !Array.isArray(result.items) ||
    !(
      result.next_cursor === null ||
      (typeof result.next_cursor === "string" && result.next_cursor.length > 0)
    )
  )
    throw new Error("The server returned invalid detection history.");
  return {
    events: normalizeDetections(result.items),
    nextCursor: result.next_cursor,
  };
}
export async function fetchDetection(eventId, options) {
  if (!recordId(eventId)) throw new Error("This detection has an invalid ID.");
  const [event] = normalizeDetections([
    await read(`/detections/${encodeURIComponent(eventId)}`, options),
  ]);
  if (event.id !== eventId)
    throw new Error("The server returned a different detection.");
  return event;
}
export async function fetchFeedbackCategories(options) {
  return normalizeCategories(await read("/feedback-categories", options));
}
export function fetchDetectionImages(eventId, options) {
  if (!recordId(eventId)) throw new Error("This detection has an invalid ID.");
  return read(`/detections/${encodeURIComponent(eventId)}/images`, options);
}
export async function submitFeedback(eventId, values) {
  if (!recordId(eventId)) throw new Error("This detection has an invalid ID.");
  const body = feedbackPayload(values);
  if (values.image) body.image_base64 = values.image;
  const result = await apiRequest(
    `/detections/${encodeURIComponent(eventId)}/feedback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (
    !recordId(result?.feedback_id) ||
    String(result.detection_id) !== eventId ||
    String(result.farmer_id) !== String(values.farmerId)
  ) {
    throw new Error(
      "The server did not confirm this feedback record. Check the event before resubmitting.",
    );
  }
  return result;
}
