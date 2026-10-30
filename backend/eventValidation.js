const { createHash } = require("node:crypto");
const { requireId, number, fail } = require("./apiHelpers");
const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest = (value) => createHash("sha256").update(value).digest("hex");
function timestamp(value, label) {
  const match =
    typeof value === "string" &&
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (
    !match ||
    !Number.isFinite(Date.parse(value)) ||
    Number(match[1].slice(0, 4)) < 1 ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59 ||
    Number(match[4]) > 59 ||
    new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]
  )
    fail(400, `${label} must be a valid ISO timestamp with a timezone.`);
  const microseconds = (match[5] || "").padEnd(6, "0");
  return new Date(value)
    .toISOString()
    .replace(/\.\d{3}Z$/, `.${microseconds}Z`);
}
function dimensions(bytes, type) {
  if (type === "image/png") {
    if (
      bytes.length < 45 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.toString("ascii", bytes.length - 8, bytes.length - 4) !== "IEND"
    )
      return null;
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes.at(-2) !== 255 ||
    bytes.at(-1) !== 217
  )
    return null;
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset++] !== 255) return null;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (
      [
        192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
      ].includes(marker) &&
      length >= 8
    )
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    offset += length;
  }
  return null;
}
function decodeImage(image, index) {
  if (
    !image ||
    !["image/jpeg", "image/png"].includes(image.content_type) ||
    typeof image.data_base64 !== "string" ||
    image.data_base64.length > 7 * 1024 * 1024 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data_base64) ||
    image.data_base64.length % 4 !== 0
  )
    fail(400, "Images must be base64 JPEG/PNG data of at most 5 MB each.");
  const bytes = Buffer.from(image.data_base64, "base64");
  const size = dimensions(bytes, image.content_type);
  if (
    !size ||
    !size.every((n) => Number.isInteger(n) && n > 0) ||
    size[0] * size[1] > 20000000 ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes.toString("base64") !== image.data_base64
  )
    fail(400, "Invalid, oversized or unsupported image.");
  const sequence = image.sequence_number ?? index + 1;
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 5)
    fail(400, "Image sequence numbers must be between 1 and 5.");
  return {
    bytes,
    content_type: image.content_type,
    sha256: digest(bytes),
    captured_at: timestamp(image.captured_at, "Image capture time"),
    sequence_number: sequence,
  };
}
function validateEvent(body) {
  if (
    !body ||
    typeof body.source_event_id !== "string" ||
    !uuidPattern.test(body.source_event_id)
  )
    fail(400, "A stable source_event_id UUID is required for retries.");
  if (
    body.decision !== "CONFIRMED_HARVEST" ||
    body.vibration?.detected !== true ||
    body.camera?.prediction !== "DURIAN"
  )
    fail(
      400,
      "Confirmed harvests require agreeing vibration and camera evidence.",
    );
  const confidence = number(
    body.camera.confidence,
    "Camera confidence (%)",
    90,
    100,
  );
  const optional = (value, label) =>
    value === undefined || value === null
      ? null
      : number(value, label, 0, 999999.999999);
  const amplitude = optional(body.vibration.amplitude, "Amplitude");
  const unit = body.vibration.amplitude_unit ?? null;
  if (
    (amplitude !== null && !["g", "m/s²"].includes(unit)) ||
    (unit !== null && !["g", "m/s²"].includes(unit))
  )
    fail(400, "Amplitude must specify g or m/s².");
  if (body.farmer_id !== undefined || body.gateway_id !== undefined)
    fail(400, "Farmer and gateway identities come from the device credential.");
  if (
    !Array.isArray(body.images) ||
    body.images.length < 1 ||
    body.images.length > 5
  )
    fail(400, "Confirmed harvests need 1–5 captured images.");
  const images = body.images
    .map(decodeImage)
    .sort((a, b) => a.sequence_number - b.sequence_number);
  if (
    new Set(images.map((image) => image.sequence_number)).size !==
      images.length ||
    images.reduce((sum, image) => sum + image.bytes.length, 0) >
      10 * 1024 * 1024
  )
    fail(
      400,
      "Images need unique sequence numbers and a combined size of at most 10 MB.",
    );
  if (
    body.camera.model_version !== undefined &&
    (typeof body.camera.model_version !== "string" ||
      !body.camera.model_version.trim() ||
      body.camera.model_version.length > 100)
  )
    fail(400, "Invalid model version.");
  const evidence = {
    source_event_id: body.source_event_id.toLowerCase(),
    node_id: requireId(body.node_id),
    occurred_at: timestamp(body.occurred_at, "Event time"),
    decision: body.decision,
    vibration: {
      detected: true,
      amplitude,
      amplitude_unit: unit,
      frequency_hz: optional(body.vibration.frequency_hz, "Frequency (Hz)"),
      duration_seconds: optional(
        body.vibration.duration_seconds,
        "Duration (seconds)",
      ),
    },
    camera: {
      prediction: "DURIAN",
      confidence,
      model_version: body.camera.model_version?.trim() || null,
    },
    images: images.map((image) => ({
      content_type: image.content_type,
      sha256: image.sha256,
      captured_at: image.captured_at,
      sequence_number: image.sequence_number,
    })),
  };
  return { evidence, images, payloadHash: digest(JSON.stringify(evidence)) };
}
module.exports = { validateEvent, decodeImage, digest, uuidPattern };
