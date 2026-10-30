# Deploy Duri.AI: Render, Supabase and Vercel

The implementation preserves the existing React/Vite and Express/`pg` stack.
Web Push adds the `web-push` dependency; Supabase Storage uses its HTTPS REST API.
No WebSocket server, Redis, Supabase Auth migration or new application framework
is introduced. Node.js **24.x** is pinned in both packages.

## 1. Supabase PostgreSQL and private Storage

1. Keep your existing project/database and records. For an entirely empty database
   only, apply the repository table files in their documented foreign-key order.
   Do not run seed/TRUNCATE scripts against an existing or production database.
2. Copy a server PostgreSQL connection URL from Supabase's Connect panel. Use an
   IPv4-compatible session-pooler address if Render cannot reach a direct IPv6
   database address. Keep connection credentials out of frontend settings.
3. The backend accepts `DATABASE_URL` first; existing local `DB_*` settings remain
   supported when it is blank. Set `DB_SSL=true` for Supabase and production.
   Certificate verification is always enabled. If needed, install a trusted CA
   and set `DB_SSL_CA_FILE`; do not disable verification to resolve TLS errors.
   URL SSL flags cannot silently override this policy. `DB_POOL_MAX` defaults to 5.
4. Create a **private** Storage bucket, default name `harvest-images`. Only the
   backend receives `SUPABASE_SERVICE_ROLE_KEY`. No browser or Pi receives this
   service credential. The backend verifies the bucket is private before uploads
   or signing; it does not change existing bucket policies or make objects public.
5. Startup applies repeatable migrations under the existing PostgreSQL advisory
   transaction lock, including `004_cloud_events_push.sql`. The backend role must
   own the application tables/permit these migrations. Existing accounts and
   records are preserved; sensor measurements become nullable/wider, image rows
   gain private Storage references, and gateway/push tables are added.
6. Application tables have RLS enabled; new cloud tables have no browser policies. This prevents
   Supabase Data API roles bypassing Node ownership checks. The table-owning
   backend PostgreSQL role continues to operate. This app uses Node JWTs, so do
   not add broad anonymous/authenticated Supabase policies. Audit any pre-existing
   policies: the migration deliberately does not delete them. Migrate any external
   direct-Data-API client deliberately before deployment. Existing public Storage
   images are not made private by PostgreSQL RLS; audit their bucket separately.

Camera and farmer feedback images use private Storage when configured. Feedback
records retain their Storage references for a future training pipeline to consume;
local feedback file output remains available only in unconfigured development.
An external training script that only reads local files must be adapted before
using cloud feedback images; no automatic dataset download/training is claimed.

New images retain bucket/path/hash metadata. Owner-checked detection APIs return
signed image URLs valid for five minutes. They are not stored in PostgreSQL or
logged. The viewer can request fresh metadata after expiry/failure. Existing
legacy image URLs remain readable when actually reachable; local `/uploads/...`
placeholders are not magically converted into stored Supabase images.

## 2. Render backend

1. Sign in at [Render](https://dashboard.render.com/) and choose **New → Web Service**.
2. Connect GitHub and select `NotApel/Duri.AI`. Allow repository access if it is
   not listed. Select the branch containing this configuration; use `main` after
   merging the Render configuration pull request.
3. Use the settings below. Choose a region near your Supabase database. Singapore
   is suitable when the database is also hosted there.

   | Setting            | Value                                                      |
   | ------------------ | ---------------------------------------------------------- |
   | Service type       | Web Service                                                |
   | Runtime / Language | Node                                                       |
   | Root Directory     | `backend`                                                  |
   | Build Command      | `npm ci`                                                   |
   | Start Command      | `npm start`                                                |
   | Node version       | `24.x`, from `backend/package.json`                        |
   | Health Check Path  | `/api/health`                                              |
   | Instance type      | An always-running paid instance for prompt background push |

4. Add the environment variables below before creating the service. Render
   supplies `PORT`; the app listens on `0.0.0.0`. Do not hard-code a different
   listening port or configure this Express backend as a Static Site.
5. Click **Create Web Service**, then inspect the deployment logs. Startup applies
   migrations before listening. A database, TLS, JWT, Storage configuration or
   migration error must be resolved before the health check can pass.
6. Copy the generated `https://your-api.onrender.com` address. Open
   `https://your-api.onrender.com/api/health` and confirm status `OK`. Use your
   actual address as Vercel's `VITE_API_URL`, with `/api` appended, then redeploy
   the frontend.
7. Set `FRONTEND_ORIGINS` and `FRONTEND_URL` to your actual Vercel production
   origin, then redeploy the backend. Preserve any other required exact origins
   in the comma-separated CORS list. Test login from the deployed Vercel app.

The repository-root `render.yaml` also supports **New → Blueprint** after its
branch is available on GitHub. It describes the same backend and uses Render's
**Starter paid instance**; review the current price before applying it. Secret
fields prompt for values instead of storing them in Git. Push starts disabled in
this blueprint: add the three VAPID values and set `PUSH_ENABLED=true` to enable
it. An already deployed service must have its settings updated in Render; adding
this file alone does not reconfigure a manually created service.

A free service can demonstrate the web app, but it can sleep while idle. Pending
push jobs cannot be processed during sleep; new requests may have to wait for a
cold start. Use an always-running instance for harvest alerts. Images are kept
in Supabase Storage rather than Render's ephemeral local filesystem.

Set backend-only variables through Render's secret environment settings:

```dotenv
NODE_ENV=production
DATABASE_URL=<Supabase server PostgreSQL connection URL>
DB_SSL=true
DB_POOL_MAX=5
JWT_SECRET=<existing strong signing secret>
FRONTEND_URL=https://your-app.vercel.app
FRONTEND_ORIGINS=https://your-app.vercel.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<backend-only service role key>
SUPABASE_STORAGE_BUCKET=harvest-images
PUSH_ENABLED=true
VAPID_PUBLIC_KEY=<public VAPID key>
VAPID_PRIVATE_KEY=<backend-only private VAPID key>
VAPID_SUBJECT=mailto:your-maintained-contact@example.com
```

Generate VAPID keys once in a trusted operator terminal using the installed
`web-push` tool. Keep the private key stable and secret; rotating it requires
browsers to resubscribe. These are separate from JWT/device credentials.

```sh
cd backend
npx web-push generate-vapid-keys
```

Retain SMTP variables from the password-recovery guide. Use the generated Render
API HTTPS hostname when configuring the frontend. `FRONTEND_URL` is used for password-reset links; frontend/API may have
separate origins. Add exact additional frontend origins only when needed; no
wildcard credentialed CORS. The production proxy setting trusts one Render proxy
hop; do not expose that setting on a directly accessible untrusted proxy chain.

`DEVICE_API_KEY` supports legacy device routes during migration. New Pi events
must use provisioned per-gateway Bearer credentials. Remove the shared legacy key
when old producers have migrated. Registration does not provision physical
hardware or install firmware.

## 3. Vercel frontend

- Root: repository root; framework: Vite.
- Install: `npm ci`; build: `npm run build`; output: `dist`.
- Public environment variable: `VITE_API_URL=https://your-api.onrender.com/api`.
- Redeploy after changing this build-time value. The build rejects invalid API
  configuration; remote production pages require HTTPS. HTTP loopback is allowed
  for local preview, not a Vercel deployment.
- `vercel.json` supplies the SPA fallback for direct event links and leaves assets,
  icons, manifest, API paths and `/sw.js` out of that fallback.
- The service worker is served without stale HTTP caching. Public build assets are
  versioned/pre-cached; old owned caches are removed on activation. Updates wait
  rather than forcibly reloading a farmer's form; closing all controlled tabs lets
  the new version activate.

Never define database, Storage-service, Pi or VAPID private credentials using a
`VITE_` prefix. This frontend does not need a Supabase service/anon key.

## 4. Push and account behaviour

Settings → **Harvest push notifications** has actual enable/disable controls.
Permission is requested only on Enable. First-release targets are Android Chrome
and desktop Chrome/Edge/Firefox over HTTPS (localhost for development). Denied,
unsupported, unconfigured and failed states retain an in-app Alerts fallback.
Browser settings, OS power policies, network connectivity and provider availability
can delay or suppress delivery; browser permission is not a delivery guarantee.

Subscriptions belong to the authenticated farmer and current database session.
Multiple active browser sessions are supported. Logout/password reset removes
subscriptions through session foreign-key cascades; expired sessions are excluded
from sending. A queued alert is also cancelled if the farmer has since rejected
the detection. A live endpoint cannot be reassigned to a different farmer. Only
supported HTTPS push-provider hosts and valid encryption keys are accepted, so
subscription endpoints cannot be used as arbitrary server-side fetch targets.

The service worker stores only an account marker in IndexedDB, not JWTs or API
responses. It suppresses another account's queued push and clears displayed
notifications when the account changes or signs out. Notification clicks open the
same-origin event route and preserve it through login. Push does not mark records
read; the existing explicit read action remains authoritative.

Push jobs are inserted with the harvest transaction. A worker polls every five
seconds and claims up to five jobs using 60-second database leases; provider
requests time out after 10 seconds. Retries use 1/5/15/60-minute backoff, respect
Retry-After, stop after five claims, and expire after 24 hours. Provider 404/410
removes the dead subscription. Other permanent failures stop retrying. Multiple
Render instances can claim safely. Failed SQL acknowledgements/crashes can cause
provider re-delivery: delivery is at least once, with a stable event notification
tag and `renotify:false` to reduce duplicate banners. Database events and in-app
notifications are deduplicated independently of push-provider delivery.

No authenticated responses, private images or signed URLs are cached by the
service worker. An offline public shell can reopen after an online visit, but
login, records, edits and feedback still require connectivity. Full offline record
synchronization is outside this release.

## 5. Existing training and operations

The merged syntax errors/duplicate route definitions are reconciled into the
existing modules. Weekly and manual retraining use the same configured worker.
Manual successful starts are limited to three per authenticated farmer per day;
the weekly schedule defaults to Sunday 02:00 in Asia/Kuala_Lumpur (Malaysia time). Configure
`PYTHON_PATH` and `RETRAIN_SCRIPT_PATH` only when the actual external program exists
in the deployment. `AUTO_RETRAIN_ENABLED=false` disables the schedule. Windows
paths are not cloud defaults. No training script/model evaluation was fabricated.
A Node-only Render installation reports training unavailable until configured.
Scheduled training across multiple replicas still needs dedicated durable job
orchestration before running a shared real model pipeline; keep training enabled
on only one instance. The push outbox already supports multiple replicas.

The worker stops claiming jobs on SIGTERM/SIGINT, the HTTP server drains requests,
and PostgreSQL closes with a bounded shutdown timeout. Interrupted push leases and
pending Pi receipts recover after restart. Logs contain event/gateway/delivery IDs
and status codes, not credentials, image data, subscription URLs or signed links.
Inspect `gateway_event.state`, `push_delivery.status/attempts/last_error` and
provider settings when diagnosing delivery. Never treat a queued job as proof a
farmer saw an alert.

## 6. Verification before production use

1. Run `node --test tests/*.test.js`, `npm --prefix backend test`, focused lint and
   a frontend build. Use a disposable local PostgreSQL role allowed to create/drop
   test databases. Test helpers clear inherited cloud connection/push/Storage
   configuration; no tests should target production.
2. Run `tests/cloudPwa.browser.cjs` with Playwright/Chromium and local PostgreSQL.
   It builds/previews the PWA, uploads to a local Storage emulator, renders actual
   image bytes and exercises real service-worker registration/synthetic push.
   Browser subscriptions/provider delivery are simulated; no real farmers are sent
   test alerts. Existing browser regression scripts remain available.
3. In an isolated staging farm, provision a simulation gateway, enable alerts on
   an actual Android device and desktop browser, send one simulated event, and
   retry its identical ID. Verify one event/in-app notification, signed-image
   access, background delivery, click-through, logout and expired subscriptions.
4. Test a Render restart while a push is pending and a Storage outage during a
   Pi upload. Existing database records must remain intact.
5. Real Supabase credentials, Render/Vercel hosting, OS/browser background delivery
   and physical ESP32/Pi capture/inference require this staging verification. Local
   emulator tests do not prove those external services/hardware are connected.
