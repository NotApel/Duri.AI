# Farm management, map locations, detections and training setup

The farm management UI supports **Browser simulation** and **Backend records**.
This branch implements the matching Node.js/PostgreSQL routes. Existing login,
Montserrat, palette and grid layout are preserved. No new framework is required.

## Start in VS Code on Windows

1. Install root dependencies with `npm ci`. In another terminal, run `cd backend`
   and `npm ci`.
2. Start PostgreSQL. Keep the existing database and accounts. Use
   [authentication setup](authentication.md) to configure the existing `DB_*`,
   `JWT_SECRET`, exact `FRONTEND_ORIGINS` and `DEVICE_API_KEY` settings in
   `backend/.env`. Never commit the file or put device credentials in frontend code.
3. For a **new, empty database only**, apply repository schema files in this order:
   `farmer.sql`, `farmplot.sql`, `sensornode.sql`, `sensorreading.sql`,
   `detection.sql`, `detectionimage.sql`, `feedbackcategory.sql`,
   `detectionfeedback.sql`, `notification.sql`, `trainingqueue.sql`.
   Do not rerun CREATE TABLE scripts or destructive seeds on an existing database.
4. Run `npm start` inside `backend/`. The existing startup migration transaction
   now includes `003_farm_locations.sql`. It removes the NOT NULL requirement from
   legacy plot coordinates and adds nullable device coordinates/location time and
   an `is_active` flag to nodes. Existing plot coordinates, accounts, sensor records
   and detections are preserved. Migration is repeatable and tolerates auth-only
   installations. After adding farm tables to an auth-only installation, restart
   the backend to apply the farm migration.
5. Run `npm run dev` in the repository root. Log in normally. Under Farm plots or
   Node Status, select **Management data source → Backend records** for PostgreSQL
   workflows. Simulation remains the default, deliberately separate from backend
   records and Harvest Logs.

## Farmer workflows

- Create/edit/select plots using farm name, plot name and a positive size in
  hectares. No coordinates are requested from the farmer. Editing does not erase
  retained legacy reference coordinates.
- Register a node against an owned plot. Firmware version is optional. A new node
  starts OFFLINE with unknown battery, heartbeat and position. Registration does
  not install firmware or connect hardware.
- Reassign an unused node between owned plots. A node with **any sensor readings**
  cannot be reassigned; this preserves historical plot ownership. In simulation,
  reassignment is blocked once a candidate event exists.
- Disable/enable nodes without deleting their history. Disabled nodes display as
  disabled and the API rejects their heartbeat, sensor-reading, device-detection
  and fusion submissions. This flag does not remotely power off hardware. Enabling
  alone does not manufacture a heartbeat.
- Delete unused nodes and empty plots after a confirmation. A node with sensor
  history or a plot with registered nodes returns `409`; retain/disable the node
  instead. Failed operations roll back transactions and keep records intact.
- **Simulate online/offline** and **Simulate candidate event** affect only local,
  account-scoped browser simulation. No real hardware, GPS, battery or AI result
  is invented. Disable blocks new simulated events; simulation delete guards keep
  event history. Old simulation records remain readable after coordinate removal.
- Notification listing, explicit read state and detection links keep their existing
  behaviour. Backend mode never silently switches to simulation when an API fails.

## API contracts

IDs are decimal strings to preserve PostgreSQL BIGINT precision. Farmer routes use
JWT/session authentication and derive the owner from `req.farmer.id`. Missing or
foreign records return `404`, invalid input `400`, history/duplicate conflicts
`409`, and operational failures `503`. Legacy singular plot/detection aliases
remain supported.

| Endpoint                                        | Behaviour                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET/POST /api/farmers/:farmerId/plots`         | List/create owned plots                                                                |
| `PATCH/DELETE /api/plots/:plotId`               | Edit or delete an owned, empty plot                                                    |
| `GET/POST /api/plots/:plotId/nodes`             | List/register nodes in an owned plot                                                   |
| `PATCH /api/nodes/:nodeId`                      | Save `node_name`, optional `firmware_version`, `plot_id`, optional boolean `is_active` |
| `DELETE /api/nodes/:nodeId`                     | Delete a node only without sensor history                                              |
| `GET /api/nodes`                                | All owned nodes, including latest reported positions and derived connection status     |
| `POST /api/device/nodes/:nodeId/heartbeat`      | Device-key-authenticated telemetry report                                              |
| `GET /api/notifications`                        | Owned notifications                                                                    |
| `PATCH /api/notifications/:notificationId/read` | Mark an owned notification read                                                        |

Create/update plot payload: `{farm_name, plot_name, plot_size}`. Size is between
0.01 and 999999.99 hectares. Node names have 1–50 characters and firmware versions
at most 20. Device connection state cannot be set by a farmer PATCH request.

### Device locations and heartbeat

The IoT/backend developer calls the heartbeat endpoint with the existing
`x-api-key` header. Body fields are optional, but latitude and longitude must be
supplied **together**, as valid numeric coordinates (-90..90 and -180..180).
`battery_level` is an optional integer percentage (0..100); omitted battery is
reported unavailable. Use actual measured/configured device coordinates. For
hardware-free demonstrations, submit simulated telemetry only to a separate test
farm/database and identify it as simulation in the presentation.

The backend stamps `last_ping_at` and, when coordinates are supplied,
`location_recorded_at`. An omitted location preserves the last reported location.
`NODE_OFFLINE_AFTER_SECONDS` defaults to 300. ONLINE requires an active node with
an ONLINE report and a sufficiently recent heartbeat. Reading the list derives
stale nodes as OFFLINE without fabricating a new device report.

The Orchard Map plots only valid device-supplied coordinate pairs with a report
time. There are no sample boundaries or fabricated pins. No locations produces an
explicit empty state. Pins show the latest node location and timestamp, **not an
exact fruit position or a historical GPS fix at detection time**. Old positions
remain labelled with their report time; tiles still require an internet connection.
Existing device API keys are shared credentials; per-device provisioning remains
future IoT/backend work.

## Detection history and feedback

`GET /api/detections?limit=20&prediction=DURIAN&cursor=...` returns
`{items, next_cursor}`. Prediction is optional (`DURIAN` or `NOT_DURIAN`); the cursor
is opaque. Limits are 1–100. Pagination uses timestamp plus ID and preserves
PostgreSQL timestamp microseconds, so equal/near-equal timestamps do not skip
records. New events appear after a refresh; older pages use a cursor rather than
an offset that shifts when new events arrive. Default requests without query
parameters retain an array response, now up to 20 rows.

Harvest Logs retains **Date, Time (MYT), Detection type, Node**, with Previous/Next
page controls. Type filtering is server-side across history. CSV/PDF exports
include **only the currently displayed page**, stated in the screen and PDF.
Map list filters apply to loaded records, with **Load older events** for more.

`GET /api/detections/:id` loads owned events independently of the latest page.
`GET /api/detections/:id/images` checks the same ownership. List/details include
available raw sensor values, latest node location, image metadata and the latest
accepted farmer feedback. Missing values remain unavailable.

`GET /api/detections/:id/feedback` also retrieves the saved assessment, preserving
the endpoint introduced on `feature/seed-data`. Missing feedback returns `404`.

Feedback POST at `/api/detections/:id/feedback` requires a boolean
`correct_detection`: true means **Durian**, false means **No Durian**. A configured
`category_id` is required only for No Durian and optional for Durian. Comments
(`comment_farmer`) are optional for both and limited to 500 characters. Farmer
identity comes from the session; a conflicting body farmer ID is rejected.

Model REJECTED status alone does not disable the form. The model prediction stays
unchanged when the farmer corrects it. A previously accepted farmer assessment is
shown from the server after reload or session-storage loss. Concurrent duplicate
submissions are serialized on the event row and return `409`; they do not create
extra training queue entries. Legacy duplicates are retained, not silently deleted.
The optional feedback image must be a valid JPEG/PNG payload of at most 5 MB and
is saved as `backend/feedback_images/feedback_<detectionId>.jpg` or `.png`. This
storage is not a new image-serving or model-dataset deployment pipeline.

## Truthful AI Training

The Training screen shows actual account-scoped feedback/queue counts. Legacy
99.93%, 85%/92% history, farmer points, a fixed five-minute progress estimate and
claims of automatic model improvement are removed. Accuracy/history remain
**Unavailable** until genuine evaluations with model version, evaluation date,
positive test sample count and bounded numeric accuracy are supplied.

Optional `PYTHON_PATH` and `RETRAIN_SCRIPT_PATH` must point to an installed
executable and actual training script. Without them, retraining is disabled and
POST returns `503`. Configured scripts run without a shell; paths with spaces are
supported. A second concurrent start returns `409`. The API reports idle,
processing, success or failed **worker state**. This state is in memory and resets
when the backend restarts; multi-process/durable job orchestration remains future
work. Script output is not a verified evaluation or proof of device deployment.
No queue records are automatically marked completed merely because a process
exits successfully. The future verified training pipeline must record what it
processed and persist evaluation/deployment evidence.

This does not implement offline PWA installation, browser push, real hardware
capture/inference/fusion verification, or model evaluation/deployment.

## Verification

- Root data tests: `node --test tests/*.test.js`.
- Backend integration tests: `npm --prefix backend test`. Use a local PostgreSQL
  role allowed to create/drop disposable test databases; never point tests at
  production. Test helpers ignore DB_NAME and create unique databases.
- Browser tests: `tests/priorities.browser.cjs`,
  `tests/detectionIntegration.browser.cjs`, `tests/farmManagement.browser.cjs`.
  Install Playwright as a development test tool and supply Chromium and local
  PostgreSQL connection settings. Each real-backend workflow creates its own
  database; no external email is sent. The new workflow simulates device reports
  through the authenticated device API. Basemap/provider delivery and physical
  hardware are not tested.
- `npm run build` and focused ESLint for changed production files.
