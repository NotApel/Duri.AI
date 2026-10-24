export function imageUrl(path, apiBase) {
  if (typeof path !== "string" || !path.trim()) return null;
  try {
    const url = new URL(path, new URL(apiBase).origin);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function normalizeImages(rows, apiBase) {
  if (!Array.isArray(rows))
    throw new Error("The server returned an invalid image list.");
  return rows
    .filter((row) => row && typeof row === "object")
    .map((row, index) => ({
      id: String(row.image_id ?? index),
      url: imageUrl(row.image_path, apiBase),
      sequence: Number(row.sequence_number) || index + 1,
      capturedAt: row.captured_at,
    }))
    .filter((row) => row.url)
    .sort((a, b) => a.sequence - b.sequence);
}
