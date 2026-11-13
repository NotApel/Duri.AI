# Production rollout and recovery

## Before promoting the branch

1. Run `npm ci`, `npm --prefix backend ci`, `npm run lint`, `npm test` and
   `npm --prefix backend test`. Browser tests are installed through the root locked
   Playwright development dependency. Use disposable PostgreSQL for all tests.
   The GitHub Actions workflow runs these checks, browser regressions, a Cloudflare
   build and Wrangler dry-run on pushes/PRs. It never deploys or contacts real farmers.
   Generated `dist/` files are no longer tracked; deployment always builds the
   current source using the host's explicit public API URL.
   Both packages override affected development-only minimatch versions to patched
   11.x on Node 24 (GHSA-g3hv-75wg-m249). Lint and nodemon matching/restart behavior
   must pass when updating this override; remove it when upstream ranges are patched.
2. Snapshot the current production database and record the deployed backend/frontend
   commits. Verify the snapshot's retention and restore capability with your Supabase
   plan; do not assume a free plan includes the backup/PITR policy you need.
3. Restore a backup into a separate staging database, apply the new backend there,
   and compare farmer/event/feedback counts. Startup migrations are additive and
   repeatable. `005_feedback_categories.sql` adds missing reference categories only;
   it does not reset IDs, descriptions, accounts or events.
   `006_battery_measurement_time.sql` adds the optional battery measurement time;
   restart the updated backend so its heartbeat query has this column available.
   Never run the demo seed against production. It now refuses production and
   requires explicit development opt-in (`ALLOW_DESTRUCTIVE_SEED=true`).
4. Provision per-Pi gateway credentials and migrate producers to `/api/device/events`
   and gateway-authenticated heartbeats. `LEGACY_DEVICE_ROUTES_ENABLED` defaults to
   false in production. Shared-key legacy writes return 410 before parsing bodies.
   Development keeps compatibility unless explicitly disabled. Only opt in temporarily
   for existing producers after reviewing the legacy limitations; never use this as
   the fix for a gateway configuration error.
5. Configure Render using [cloud deployment](cloud-deployment.md): verified database
   TLS, private Storage, exact frontend CORS/reset origin, a strong stable JWT secret,
   SMTP and VAPID keys. The blueprint intentionally leaves push disabled until its
   keys are entered and scheduled training disabled until a real worker exists.
   Set `PUSH_ENABLED=true` after configuring VAPID. Use an always-running backend
   for prompt push processing; free-instance sleeping cannot deliver timely alerts.
6. From a trusted backend terminal with production configuration, run
   `npm run check:deployment`. This read-only preflight checks configuration,
   database tables/categories, the private Storage bucket and SMTP connectivity.
   It performs no migration, seed, event write, email send or push delivery. Review
   any existing Supabase Data API policies it flags. A passed preflight does not
   prove inbox delivery or a phone notification.
7. Deploy backend first, confirm `/api/health`, then build/deploy Cloudflare with
   the actual HTTPS API URL ending in `/api`. Fresh production sessions open Dashboard
   and management on backend records; labelled simulation is still available by choice.
   Existing explicit per-session mode preferences remain respected.
8. On an isolated staging farm/phone, test event replay without duplicates, real
   private image bytes/expiry refresh, feedback, reset email, closed-PWA push,
   notification click-through and logout isolation. Test Pi/network and Render
   restarts with pending events. Confirm camera/inference and node locations on
   real hardware separately. The frontend layout, Montserrat and palette are preserved.

## Monitoring

Configure external uptime checks for the Render `/api/health` route and frontend
HTML/assets. The health route verifies PostgreSQL, not SMTP, Storage or phone delivery;
run the preflight separately when provider configuration changes. Alert on startup
migration/TLS failures, repeated 5xx responses, failed push jobs and oldest pending
gateway receipts. Inspect `push_delivery.status/attempts/last_error` and
`gateway_event.state/received_at`; correlate event/delivery IDs, not private URLs.
On the Pi, monitor `pi/run.cjs status`, systemd restarts, queue age and disk usage.
Do not ship credentials, reset links, image payloads or subscription endpoints to logs.

## Recovery

Record the last working Cloudflare deployment and Render commit before rollout.
If an application regression occurs, redeploy those application versions, keep
additive columns/tables/reference data and preserve JWT/VAPID keys. Do not run
destructive reverse migrations as an automatic rollback. Investigate whether
the previous application works with the additive schema in staging first.

For database loss/corruption, stop writers and keep the Pi outbox intact. Restore
the tested backup using Supabase's supported procedure, verify record counts and
gateway/subscription relationships, then resume writers deliberately. A backup
restore can lose post-backup events and deduplication receipts; reconcile Pi
receipts before replaying acknowledged events. Restoring PostgreSQL alone does not
restore deleted Storage objects; include image-storage recovery in the restore drill.

## Remaining hardware/model release gate

The durable Pi sender is implemented. The ESP32 camera transfer protocol,
TensorFlow Lite preprocessing/labels, measured sensor thresholds, actual retraining
program, held-out evaluation and verified model deployment must be supplied and
tested by the hardware/model team. No model accuracy or successful deployment is
inferred from a subprocess exiting successfully. Keep retraining unavailable and
scheduled training disabled until that integration is ready.
