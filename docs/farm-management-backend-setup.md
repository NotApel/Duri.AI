# Farm plots, sensor nodes and notifications: backend setup guide

This feature changes the frontend only. No backend route, database schema,
production record, auth flow, dependency or hardware integration was changed.
It builds on `feature/detection-integration` and is published on
`feature/farm-management`.

## Frontend walkthrough

1. Log in normally. A working authentication backend is still required; no preview
   login or authentication bypass is provided.
2. Open **Farm plots** from the sidebar or **More → Farm plots** on a phone.
   **Browser simulation** is the default management source. Create a plot with
   a farm name, plot name, positive size in hectares and reference coordinates.
   Select it, edit it or cancel an edit. Zero coordinates are valid. Coordinates
   are reference points, not measured fruit locations.
3. Open **Node Status**. The selected plot carries across navigation/reloads.
   Register a named node with an optional firmware version. New nodes start
   OFFLINE, with battery and heartbeat unavailable. Edit/reassign a node before it
   has event history. Reassignment after an event is blocked to preserve history.
4. **Simulate online/offline** changes only local demonstration state. An online
   simulation records the time of that action as its simulated heartbeat; battery
   remains unavailable. **Simulate candidate event** creates an unverified
   candidate and unread notification, with no invented measurements or prediction.
5. Open **Notifications** (**Alerts** on a phone). Filter all/unread/read, inspect
   a notification, explicitly **Mark as read**, and follow **View detection details**.
   Opening a notification alone does not mark it read. Simulated event details use
   `/map/simulation/events/:id`, clearly separate from real backend event routes.
6. Switch **Management data source** to **Backend records** to use the server.
   Backend mode never falls back to simulation on errors. Currently available:
   plot list/create, node list and notification list. Missing writes display an
   error and retain edits/read state; they never claim a PostgreSQL save.

Simulation is stored in `localStorage` under `duriai.farm-simulation.v1.<farmerId>`.
Mode and selected backend plot are separate, account-scoped `sessionStorage`
preferences. Records are not synced to PostgreSQL or another device. A storage
failure prevents a successful-save message. Corrupt saved simulation is reported
and cannot be overwritten by ordinary saves. **Reset farm simulation** asks for
confirmation and clears only that account's local farm simulation. Normal backend
Orchard Map detections, feedback receipts and Harvest Logs are unaffected.

Reload still needs a working auth session/backend. No offline installation,
service-worker caching, actual browser push, real OTA or firmware deployment is
implemented by these screens.

## 1. Start the existing backend in VS Code / Windows

The backend developer should first follow [authentication setup](authentication.md).
Keep any existing database/accounts; do not drop tables or run a destructive seed.

1. In the repository root, run `npm ci`.
2. In a second terminal, run `cd backend`, then `npm ci`.
3. Start PostgreSQL. In pgAdmin, identify the intended development database, login
   role and port. Existing tables must include `farmer`, `farm_plot`, `sensor_node`,
   `sensor_reading`, `detection`, `detection_image`, `feedback_category`,
   `detection_feedback`, `notification` and `training_queue`.
4. For an entirely new database only, apply the CREATE TABLE files in this order:
   `farmer.sql`, `farmplot.sql`, `sensornode.sql`, `sensorreading.sql`,
   `detection.sql`, `detectionimage.sql`, `feedbackcategory.sql`,
   `detectionfeedback.sql`, `notification.sql`, `trainingqueue.sql`.
   Existing databases need inspected, additive migrations rather than rerunning
   CREATE TABLE scripts. No new schema is required for the proposed routes below.
5. Create an untracked `backend/.env` using `backend/.env.example` as a reference:

   ```dotenv
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=your_development_database
   DB_USER=your_development_role
   DB_PASSWORD=your_local_password
   JWT_SECRET=replace_with_a_unique_random_secret
   PORT=3000
   FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   DEVICE_API_KEY=replace_with_a_separate_device_secret
   ```

   Generate a JWT secret locally with:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Never commit the resulting secret or `.env`. `DATABASE_URL` alone is not used.
6. Run `npm start` or `npm run dev` in `backend/`. Existing auth migrations run
   before the server listens. Resolve startup errors before frontend integration.
7. Run `npm run dev` in the repository root. Add the exact printed frontend origin
   to `FRONTEND_ORIGINS` if the port differs. Optional frontend `VITE_API_URL` must
   include `/api`, for example `http://localhost:3000/api`. Use the same hostname
   for frontend and backend. Register an account, log in, and select Backend records.

## 2. Endpoints expected by the frontend

All routes below require the existing JWT/session authentication middleware. IDs
are strings, preserving PostgreSQL BIGINT precision. Responses must be JSON. All
server ownership checks must derive identity from `req.farmer.id` (a string).
Do not compare that string to a numeric `parseInt(...)` with strict inequality.
Do not trust a route/body farmer ID as authorization.

| Endpoint | Present on current main? | Expected successful response |
| --- | --- | --- |
| `GET /api/farmers/:farmerId/plots` | Yes; ownership still needs enforcement | Array of owned plot rows |
| `POST /api/farmers/:farmerId/plots` | Yes; validation/ownership need hardening | `201`, created plot row |
| `PATCH /api/plots/:plotId` | No | `200`, updated owned plot row |
| `GET /api/plots/:plotId/nodes` | Yes; ownership still needs enforcement | Array of nodes belonging to an owned plot |
| `POST /api/plots/:plotId/nodes` | No | `201`, registered node row |
| `PATCH /api/nodes/:nodeId` | No | `200`, updated node row |
| `GET /api/notifications` | Yes; currently a global latest-50 list | Array filtered server-side to the authenticated farmer |
| `PATCH /api/notifications/:notificationId/read` | No | `200`, updated owned notification row with `is_read: true` |

Frontend notification filtering excludes other farmer IDs from display as an
interim measure. The current server still sends those records over the network;
client filtering is not access control. Fix ownership before production use.
Until the server filters/paginates correctly, lists and unread counts only describe
records returned by the API, not the complete account history.

### Plot create/update

```json
{
  "farm_name": "Demo farm",
  "plot_name": "East plot",
  "plot_size": 2.5,
  "latitude": "0",
  "longitude": "101.5"
}
```

Validate trimmed names (1–200 characters), positive finite size up to 999999.99,
latitude −90…90 and longitude −180…180. Reject null/blank coordinates, but accept
numeric zero. The frontend currently sends coordinate strings to support the
legacy create handler's truthiness check. Use explicit validation in the backend.
Whitelist writable fields; derive ownership from auth. A response must include
`plot_id`, `farmer_id`, both names, `plot_size`, `latitude` and `longitude`.
The edit response ID must match the requested plot.

### Node registration/update and assignment

```json
{
  "plot_id": "7",
  "node_name": "East node 1",
  "firmware_version": "v1.0.0"
}
```

Require an owned target plot and a trimmed node name (1–50 characters). Firmware
is optional metadata, at most 20 characters; an empty value is sent as null.
Resolve duplicate names deliberately (recommended case-insensitive uniqueness),
returning `409` instead of silently replacing an existing node.

New nodes should default OFFLINE, with null battery and heartbeat. Return
`node_id`, `plot_id`, `node_name`, `firmware_version`, `status`, `battery_level`
and `last_ping_at`. The frontend accepts only ONLINE/OFFLINE as reported states;
unknown/missing states display UNKNOWN. Editing metadata does not flash firmware.
Do not permit an ordinary farmer PATCH to invent battery, heartbeat or connectivity.
Derive those fields from authenticated device telemetry and a documented timeout.

For reassignment, verify ownership of both current and destination plots within a
transaction. The existing reading history joins through the node's current plot;
changing `plot_id` can relabel history. Return `409` if the node has readings/events,
or first implement immutable event/plot attribution with an additive migration.
This frontend simulation blocks reassignment after its first candidate event.

### Notifications and read updates

A notification row uses:

```json
{
  "notification_id": "73",
  "farmer_id": "42",
  "detection_id": "101",
  "title": "Candidate needs review",
  "message_noti": "Inspect the available evidence.",
  "is_read": false,
  "created_at": "2026-10-23T09:00:00Z"
}
```

The read PATCH has no request body. Use an ownership-scoped, idempotent update:
`UPDATE notification SET is_read = TRUE WHERE notification_id = $1 AND farmer_id = $2 RETURNING *`.
Return the resulting row even if already read. The frontend validates the ID,
owner and true boolean before updating its UI; `204` alone is not this contract.
Return 404 for missing/unowned records without exposing another farmer's details.
Return 401 for an expired session, 400/422 for invalid fields, 409 for conflicts,
and a non-success status on database errors. Never return a successful read update
before its transaction commits.

Notification event links currently open `/map/events/:detectionId`, whose API only
returns the latest ten detections. Older events show unavailable. Add an owned
single-event lookup and coordinate frontend support separately; do not substitute
sample events. Candidate alerts must remain distinct from verified harvest alerts.
Actual push delivery, subscriptions and permissions require separate implementation.

## 3. Backend acceptance checklist

- Test owner A and owner B: no cross-farmer reads, node assignments, edits or read
  updates. Test unauthenticated requests and revoked/expired sessions.
- Test zero coordinates, blank fields, name/size limits and duplicate node names.
- Test registration defaults, reassignment with and without history, and rollback
  if an assignment transaction fails. Preserve all existing readings and accounts.
- Mark a notification read twice; both responses should return the same owned read
  row. Unavailable database/endpoint must not report success. Consider idempotency
  keys for creation so retries after lost responses cannot create duplicates.
- Use explicitly labelled simulated sensor events until hardware is ready. Do not
  invent telemetry, measured model metrics or successful device updates.

## Frontend verification

- `node --test tests/*.test.js`: plot validation, registration, assignment/history,
  candidate integrity, notification filtering and existing detection regressions.
- Focused ESLint on changed frontend files and `npm run build` with output directed
  outside the repository to avoid rewriting already tracked `dist` artifacts.
- `NODE_PATH=/path/to/test-tools/node_modules node tests/farmManagement.browser.cjs`
  uses external Playwright/Chromium, starts Vite, and intercepts API responses.
  It checks simulation, forms/cancel, read states, links, persistence/storage errors,
  account isolation, missing/current/proposed backend contracts, source separation
  and 320/390/1440 layouts. It is not proof that the proposed backend routes exist.
- Existing real-backend detection and authentication tests remain separate.

Verification on this branch: all 23 unit tests, all 9 real-backend authentication
tests, the real-backend detection browser regression, the mocked management browser
workflow, focused frontend ESLint and the production build pass. Main's existing
full-repository lint failures in `backend/app.js` and `TrainingHistory.jsx` are
outside this frontend task; those files remain unchanged. Build artifacts and test
screenshots are directed to temporary directories instead of tracked `dist` files.
