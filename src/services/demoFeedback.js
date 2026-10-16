const KEY = "duriai.simulation.feedback.v1";
export const feedbackLabels = {
  confirmed: "Farmer confirmed durian",
  rejected: "Farmer reported false alarm",
  unsure: "Farmer unsure",
};
export const categories = ["Animal", "Wind", "Rain", "Falling branch", "Other"];
export function readFeedback(storage = window.localStorage) {
  const value = storage.getItem(KEY);
  if (!value) return {};
  const records = JSON.parse(value);
  if (!records || typeof records !== "object" || Array.isArray(records))
    throw new Error("Invalid demo feedback storage.");
  for (const record of Object.values(records)) {
    if (
      !record ||
      !feedbackLabels[record.label] ||
      typeof record.savedAt !== "string" ||
      !Number.isFinite(Date.parse(record.savedAt))
    )
      throw new Error("Invalid saved feedback.");
  }
  return records;
}
export function saveFeedback(
  records,
  id,
  label,
  category,
  comment,
  storage = window.localStorage,
) {
  if (!id.startsWith("SIM-") || !feedbackLabels[label])
    throw new Error("Invalid simulated feedback.");
  if (label === "rejected" && !categories.includes(category))
    throw new Error("Choose a false-alarm category.");
  const next = {
    ...records,
    [id]: {
      label,
      category: label === "rejected" ? category : null,
      comment: comment.trim().slice(0, 500),
      savedAt: new Date().toISOString(),
      source: "simulation",
    },
  };
  storage.setItem(KEY, JSON.stringify(next));
  return next;
}
