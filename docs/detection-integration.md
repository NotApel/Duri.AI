# Frontend detection integration

Orchard Map, detection details and Harvest Logs now share one authenticated
backend detection list. They do not substitute demo records when the API is empty
or unavailable. The existing grid, palette, Montserrat and login layout remain.
Dashboard's separate demonstration mode and illustrative map geometry are still
labelled simulations; this change does not connect physical hardware.

## Try the workflow

1. Follow [authentication setup](authentication.md) to start PostgreSQL, the
   existing backend and Vite. Use your usual registered account; a working backend
   and JWT login are required. No credentials or environment files are included.
2. Open Orchard Map. Refresh events to request the latest API records. An empty
   database produces an empty state, rather than sample detections. The backend
   developer can provide simulated events through the existing authenticated
   device/API integration; keep those records identifiable as test data.
3. Open a detection, inspect its reported prediction and available images, choose
   **Durian** or **No Durian**, select a category and enter your observations.
   Categories must exist in the database and are fetched from the API; their IDs
   are never assumed. The signed-in farmer's ID is used for feedback.
4. Submit feedback. A success receipt appears only after the API acknowledges the
   record. The event list refreshes to read the server's status. A reviewed event
   leaves the map's current list in this browser session; find it in Harvest Logs.
   The existing optional JPEG/PNG feedback upload is retained, with a 5 MB client
   limit and file-read errors. The backend stores it through `image_base64`; the
   acknowledgement does not prove it was evaluated or used in training. Server
   content validation and storage permissions remain backend responsibilities.
5. Harvest Logs shows date, time in Malaysia (MYT), detection type and node. Click
   a date to reopen details. Filter by detection type and export the displayed
   records to CSV or PDF. CSV cells escape quotes and neutralize formulas from
   untrusted backend node names.

A backend `REJECTED` status does not mean the farmer has reviewed the event.
Opening a rejected event from Harvest Logs still shows the feedback form when no
acknowledged farmer-feedback receipt exists. The farmer can classify it as Durian
and explain the correction. An actual accepted farmer submission retains its
receipt and duplicate-submit protection. Status alone never locks the form.

Network errors preserve previous records with a stale-data warning and disable
feedback/exports until a successful refresh. Offline feedback is disabled; there
is no offline submission queue or service-worker caching. Requests time out after
15 seconds. Reads abort on navigation or a newer refresh. POSTs are never retried
automatically. Failed submissions retain the form for correction or manual retry.

## Contract with the existing main backend

| Request | Frontend handling |
| --- | --- |
| `GET /api/detections` | Validates IDs/timestamps and normalizes raw database fields. Currently limited to the ten newest records. |
| `GET /api/feedback-categories` | Uses `category_id` and `category_name` from the response. Empty/error states disable submission. |
| `GET /api/detections/:id/images` | Used when the list omits `images`. An explicit empty image array means no images. |
| `POST /api/detections/:id/feedback` | Sends authenticated farmer ID, chosen category ID, legacy boolean and comments; validates the acknowledgement IDs. |

The existing feedback payload is:

```json
{
  "farmer_id": "123",
  "category_id": "27",
  "correct_detection": false,
  "comment_farmer": "Saw an animal, no fruit."
}
```

These IDs illustrate the shape only. The current backend maps
`correct_detection: true` to `VERIFIED` and `false` to `REJECTED`, regardless of the
original model prediction. The frontend therefore maps **Durian** to true and
**No Durian** to false. It does not interpret this legacy field as agreement with
the model. The original `prediction` remains visible and unchanged; farmer
assessment is shown separately in the receipt. The backend creates a PENDING
training-queue row, which is not proof of retraining or an improved model.

Image records use `sequence_number`, are ordered accordingly, and open in a native
dialog supporting Close/Escape. Relative image paths resolve against the API
origin. Missing/unreachable images have a retry state. No substitute image is
shown. Image URLs accept only HTTP(S) and never include the farmer's JWT. The
backend must supply a usable authorized/signed image URL or serve the file with
appropriate access control; frontend rendering cannot fix absent storage/routes.

The current list API does not include amplitude, frequency, duration or device
coordinates. These remain unavailable. If measurements are supplied later, numeric
values including zero are retained. Amplitude units are shown only if supplied.
Reported `VERIFIED` status is labelled as a backend status; it does not establish
that the intended vibration/camera fusion actually ran.

## Backend handoff and remaining limits

- Scope detection and image reads and feedback writes to the authenticated
  farmer's plots; validate ownership and derive farmer ID on the server. The
  current main handlers return a shared list and trust the body farmer ID.
- Provide paginated list and single-event lookup endpoints. Older/deleted event
  URLs currently show unavailable when absent from the latest ten results.
- Provide feedback read/update support and server idempotency/uniqueness. The
  frontend prevents concurrent submissions and retains acknowledged receipts in
  account-scoped `sessionStorage`, correlated with event ID and timestamp. That
  cannot deduplicate across tabs, devices or sessions. A lost POST response may
  mean the server committed; investigate before retrying. A storage failure after
  acceptance produces a warning and keeps the in-memory success receipt.
- Replace the ambiguous boolean with an explicit farmer classification while
  retaining the model prediction, reviewer and audit timestamps independently.
- Return sensor readings/units, real configured coordinates and served image
  evidence. Fix fusion rules before treating reported status as a harvest alert.
- Connect and verify inference, retraining, deployment and hardware separately.
  The newly merged AI Training screen still consumes placeholder accuracy/history
  from its backend endpoint; this detection change does not validate those metrics.

## Verification

```sh
npm run lint
node --test tests/*.test.js
npm run build
```

On the merged `main` baseline used here, all 15 unit tests and the production build
pass. Full-repository lint reports 20 existing errors in `backend/app.js` and
`TrainingHistory.jsx`; those files are unchanged by this feature. Focused ESLint
on the changed frontend files passes. Build output was directed to `/tmp` to avoid
rewriting the repository's already tracked `dist` artifacts.

`tests/detectionIntegration.browser.cjs` starts the actual backend and Vite on free
ports, creates a uniquely named temporary PostgreSQL database using the repository
schema, exercises the browser/API/database flow, then stops its children and drops
only that database. Do not run it with a production database administrator. It
requires a PostgreSQL role allowed to create databases and separately installed
Playwright/Chromium test tools; neither is added as an application dependency.
For example, with Playwright available through `NODE_PATH`:

```sh
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=postgres DB_PASSWORD=local-test-password \
  NODE_PATH=/path/to/test-tools/node_modules node tests/detectionIntegration.browser.cjs
```

Override `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. The test uses
fixture measurements and zero coordinates only inside its disposable database.
It checks actual JWT login/logout, feedback and training-queue writes, prediction
preservation, shared logs, exports, failure/retry/offline/storage handling, image
ordering/viewer behaviour and 320/390/1440-pixel layouts. Fault responses and image
bytes are intentionally intercepted; normal detection/category/feedback requests
use the real backend. Screenshots are written to the system temporary directory.
