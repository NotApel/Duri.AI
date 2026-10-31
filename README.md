# 🌳 Duri.AI

An AI-powered IoT-based durian harvest monitoring system that combines sensor fusion, edge AI, and a Progressive Web App (PWA) to accurately detect fallen durians, reduce false alarms, and provide real-time harvest notifications.

## Features and integration status

- Farmer registration, login/logout and email password recovery.
- Farm plot/node management, Orchard Map, Harvest Logs, image viewing and feedback.
- Authenticated Raspberry Pi event ingestion with persistent retry protection.
- Private Supabase image uploads and owner-checked signed image URLs.
- In-app notifications and session-scoped Web Push subscriptions.
- Installable PWA with a cached public application shell. Private records still
  require connectivity; offline editing/synchronization is not implemented.
- Clearly labelled browser and Raspberry Pi integration simulations.

Physical sensing/inference, cloud provider delivery and model evaluation/deployment
must be verified in staging. Retraining can run a configured external script, but
script completion does not prove improved accuracy or successful OTA deployment.

## Technology stack

- **Hardware target:** ESP32 sensors and Raspberry Pi 4 processing/camera inference.
- **Frontend:** React, Vite, React Router, Tailwind/CSS, Leaflet and service workers.
- **Backend:** Node.js/Express, `pg`, SQL migrations, JWT sessions, Nodemailer and
  `web-push`. Existing training scheduling uses `node-cron`.
- **Hosting:** Render backend, Supabase PostgreSQL/private Storage, Cloudflare Workers Static Assets frontend.

## System architecture

```text
ESP32 sensors → Raspberry Pi 4 processing → Node.js REST API on Render
                                            ├─ Supabase PostgreSQL
                                            ├─ Supabase private Storage
                                            └─ Web Push providers → farmer browser
                                                        ↕
                                                React PWA on Cloudflare Workers
```

The legacy ESP32 sketch under `Duri (1)/` is retained as a simulation example;
it is not proof that the new Raspberry Pi processing pipeline is connected.

## 📄 License

This project is developed as a Final Year Project (FYP) at the German-Malaysian Institute (GMI).

## Authentication and existing databases

See [authentication setup](docs/authentication.md) for local configuration,
registration/login/logout, and the automatic migration that fixes older farmer
tables missing `username`. Keep existing farmer records; do not drop or recreate
your database to resolve error 42703. The backend requires `JWT_SECRET` and the
existing `DB_*` settings before startup.

## Detection workflow implementation

Orchard Map and Harvest Logs use the same backend detection records. Farmers can
inspect available images and submit authenticated feedback; logs retain the four
columns date, time, detection type and node, with filtered CSV/PDF exports.
See [detection integration and backend handoff](docs/detection-integration.md).

The feature list above describes project goals. Hardware inference, retraining,
OTA, push notifications and offline PWA operation are not verified by this
frontend integration. Illustrative map geometry and Dashboard demonstration data
remain labelled separately from API records.

## Farm plots, nodes and notifications

The frontend management screens support plot creation/editing/selection, node
registration/assignment, and notification read states with event links. Their
default **Browser simulation** stores account-scoped records locally, separately
from backend detections and Harvest Logs. Choose **Backend records** to use the
available APIs; missing write endpoints report an error without claiming a save.

See the [backend setup and endpoint guide](docs/farm-management-backend-setup.md)
for VS Code/PostgreSQL configuration, required routes, payloads and ownership rules.
This feature does not modify backend code or implement real push/device updates.

## Forgot password

The login screen supports email password-reset links. Configure SMTP in the
backend and follow the [password recovery setup guide](docs/password-recovery.md).
Links expire after 15 minutes, work once, and invalidate existing login sessions
after a successful reset. The login layout and existing authentication remain.

## Cloud event and notification integration

ESP32 → Raspberry Pi 4 → Node.js on Render → Supabase PostgreSQL/private Storage
→ Cloudflare-hosted PWA. See [cloud deployment and Web Push](docs/cloud-deployment.md) and
[Pi event contract, provisioning and simulation](docs/raspberry-pi-events.md).
Existing login, farm management, logs and feedback remain in the current app.

## Cloudflare frontend deployment

See [Cloudflare Workers Static Assets setup](docs/cloudflare-workers.md) for
production/staging build variables, Wrangler preview/deployment, Render CORS
and PWA validation. The Node backend stays on Render; Supabase continues to
provide PostgreSQL/private Storage and the existing backend manages sessions.
