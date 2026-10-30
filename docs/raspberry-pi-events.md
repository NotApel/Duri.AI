# Raspberry Pi 4 processed-event API

Architecture: ESP32 sensors → Raspberry Pi 4 processing/TensorFlow Lite → separate
Node.js API → Supabase PostgreSQL/private Storage → PWA. Node validates the Pi's
result; it does not perform inference. Farmer accounts still use the existing
Node JWT/session authentication, not Supabase Auth.

## Provision a gateway

An operator uses a trusted backend terminal with database configuration available.
Create the farmer's plot and sensor nodes through the existing app first. Use
actual IDs from those records. These commands work from `backend/`:

```sh
npm run gateway -- create --farmer-id 1 --node-ids 2,3 --name "Orchard Pi" --simulation
npm run gateway -- assign --gateway-id YOUR_GATEWAY_UUID --node-ids 4
npm run gateway -- rotate --gateway-id YOUR_GATEWAY_UUID
npm run gateway -- revoke --gateway-id YOUR_GATEWAY_UUID
```

Omit `--simulation` only for a real gateway. The command returns the gateway ID and
one credential once. Store it securely on the Pi, outside source control. Do not
run provisioning as the Render startup command or publish its output to logs.
The database retains only a SHA-256 credential hash. Rotation keeps gateway/event
IDs stable, so previously recorded events can still be acknowledged on retry.
Revocation immediately blocks new authenticated requests. Assignment permits
only nodes owned by the gateway's farmer; a node belongs to one gateway at a time.
The operator tool is intentionally not a public credential-management API.

## Request contract

`POST /api/device/events` with:

```text
Authorization: Bearer <gateway credential>
Content-Type: application/json
```

```json
{
  "source_event_id": "0d2651d7-a279-4e30-a7bf-aacb5dc97178",
  "node_id": "2",
  "occurred_at": "2026-10-29T03:00:00Z",
  "decision": "CONFIRMED_HARVEST",
  "vibration": {
    "detected": true,
    "amplitude": 0.42,
    "amplitude_unit": "g",
    "frequency_hz": 18.25,
    "duration_seconds": 0.8
  },
  "camera": {
    "prediction": "DURIAN",
    "confidence": 95.2,
    "model_version": "orchard-model-v1"
  },
  "images": [
    {
      "content_type": "image/jpeg",
      "data_base64": "<base64 JPEG bytes, without a data URL prefix>",
      "captured_at": "2026-10-29T03:00:01Z",
      "sequence_number": 1
    }
  ]
}
```

Values above illustrate the contract; they are not hardware measurements. Send
actual Pi results. Vibration must be triggered and camera prediction must be
DURIAN with confidence **90–100 percent**. No sensor/model threshold is changed by
a farmer's demo preference. Uncertain/rejected candidates must not be labelled
confirmed to pass this API. Existing legacy endpoints remain available during
migration but have no stable-source-ID retry guarantee.

Amplitude/frequency/duration may be omitted or null when unavailable. Amplitude
requires `g` or `m/s²`; duration uses seconds. Zero is valid. Original normalized
measurements, image hashes, model version and source time are retained in the
receipt's evidence JSON, including precision beyond display columns. Farmer and
gateway IDs come from credentials and are not accepted in the body.

Images require 1–5 unique sequence numbers, JPEG/PNG headers and dimensions, at
most 20 megapixels, 5 MB per image and 10 MB combined. Sequence defaults to array
position. These bounded format checks do not constitute camera inference or a
malware scanner. The request parser limits JSON to 15 MB and runs after device
authentication. Gateway traffic is limited to 30 requests/minute, with an
additional IP limit. Each image has its own timezone-qualified capture time.

## Retries and outcomes

Generate `source_event_id` once on the Pi and persist the complete event in a
local outbox **before** the first send. Retain the same ID, image bytes, sequence,
measurements and timestamps across retries and Pi restarts.

- `201`: new committed event, with `detection_id`, `notification_id`,
  `push_jobs_created` and `simulation`.
- `200`: identical event already committed; original IDs are returned and no new
  notification jobs are created. A completed event can be acknowledged even if its
  node was subsequently disabled. A revoked gateway credential still returns 401.
- `400`/`413`: invalid evidence/oversized request; correct the producer rather than
  retrying indefinitely. A changed event requires its own ID.
- `401`/`404`: revoked/invalid credential or unavailable node assignment; inspect
  gateway configuration.
- `409`: the ID was already bound to different normalized content. Do not reuse it
  for a different event.
- `429`, `503`, timeouts or an unknown network outcome: retry the **same** event
  with bounded exponential backoff and respect `Retry-After` when present.

The event ID is scoped to the gateway, not the credential, and is backed by a
unique database key and row locks. A pending receipt is committed before Storage
I/O; image paths are deterministic and content-addressed. SQL failure rolls back
the reading/detection/notification/jobs while retaining the pending receipt.
Retries reuse already uploaded objects. Storage and PostgreSQL are separate
systems: an abandoned pending receipt may leave private orphan objects. Audit
pending receipts before any future cleanup; never delete objects for completed
receipts or active retries.

Event acknowledgement means committed records and queued jobs for active
subscriptions, **not delivery to a phone**. Missing subscriptions produce zero
jobs; in-app notification records still exist.

## Simulate without hardware

Use a separate development database and a gateway provisioned with `--simulation`.
Set `PI_API_URL` to the backend origin and `PI_GATEWAY_CREDENTIAL` in your trusted
local process. From `backend/`:

```sh
npm run simulate-event -- --node-id 2 --image ../tests/fixtures/capture.png --event-id 0d2651d7-a279-4e30-a7bf-aacb5dc97178
```

The simulator is refused for non-simulation gateways. It sends no invented raw
measurements and visibly records a simulated event. Timestamp defaults to the
image file's modification time; preserve it or supply `--occurred-at` on retries.
The fixture is generated test artwork, not a camera capture. Simulation labels
appear in event details, logs and notification titles. Existing browser-only farm
simulation stays separate from this real-API integration simulator.
