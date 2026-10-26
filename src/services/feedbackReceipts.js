import { recordId } from "./detectionData.js";
const key = (farmerId) => `duriai.api-feedback.v1.${farmerId}`;
export function readReceipts(farmerId, storage) {
  try {
    const records = JSON.parse(storage.getItem(key(farmerId)) || "{}");
    if (!records || typeof records !== "object" || Array.isArray(records))
      return {};
    return Object.fromEntries(
      Object.entries(records).filter(
        ([id, record]) =>
          recordId(id) &&
          record &&
          ["DURIAN", "NOT_DURIAN"].includes(record.label) &&
          recordId(record.feedbackId) &&
          (recordId(record.categoryId) ||
            (record.label === "DURIAN" && record.categoryId === null)) &&
          Number.isFinite(Date.parse(record.eventTime)) &&
          typeof record.comment === "string" &&
          typeof record.category === "string" &&
          Number.isFinite(Date.parse(record.savedAt)),
      ),
    );
  } catch {
    return {};
  }
}
export function writeReceipts(farmerId, records, storage) {
  try {
    storage.setItem(key(farmerId), JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
