// Explicit simulation sender. Reuse --event-id after any timeout or failed response.
const { parseArgs } = require("node:util");
const { readFile } = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
async function main() {
  const { values } = parseArgs({
    options: {
      "node-id": { type: "string" },
      image: { type: "string" },
      "event-id": { type: "string" },
      "occurred-at": { type: "string" },
    },
  });
  if (
    !values["node-id"] ||
    !values.image ||
    !process.env.PI_API_URL ||
    !process.env.PI_GATEWAY_CREDENTIAL
  )
    throw new Error(
      "Set PI_API_URL and PI_GATEWAY_CREDENTIAL, then supply --node-id and --image.",
    );
  const eventId = values["event-id"] || randomUUID();
  // Make a retry reproducible across processes: timestamp is derived from the file
  // unless supplied explicitly; retain this value with the event ID in a real Pi outbox.
  const { stat } = require("node:fs/promises");
  const time =
    values["occurred-at"] || (await stat(values.image)).mtime.toISOString();
  const payload = {
    source_event_id: eventId,
    node_id: values["node-id"],
    occurred_at: time,
    decision: "CONFIRMED_HARVEST",
    vibration: { detected: true },
    camera: {
      prediction: "DURIAN",
      confidence: 95,
      model_version: "SIMULATION",
    },
    images: [
      {
        content_type: /\.png$/i.test(values.image) ? "image/png" : "image/jpeg",
        data_base64: (await readFile(values.image)).toString("base64"),
        captured_at: time,
      },
    ],
  };
  console.log("SIMULATION event ID:", eventId, "occurred_at:", time);
  const endpoint = new URL("/api/device/events", process.env.PI_API_URL);
  if (
    endpoint.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
  )
    throw new Error("Remote Pi API requests require HTTPS.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PI_GATEWAY_CREDENTIAL}`,
      "Content-Type": "application/json",
      "x-duriai-simulation": "true",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),
    redirect: "error",
  });
  const result = await response.json();
  console.log("HTTP", response.status, JSON.stringify(result));
  if (!response.ok) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Simulation failed. Check configuration and retry using the same event ID, image and timestamp.",
  );
  process.exitCode = 1;
});
