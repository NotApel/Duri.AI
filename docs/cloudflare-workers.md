# Deploy the Duri.AI PWA to Cloudflare Workers

Cloudflare Workers **Static Assets** serves the existing React + Vite frontend.
The Express backend stays on **Render**, with Supabase PostgreSQL and private
Storage. Farmer authentication remains the backend's existing JWT/session flow;
this migration does not switch to Supabase Auth. No Worker API, asset binding,
WebSocket server or Cloudflare Vite plugin is needed.

## 1. Prepare the backend

Keep the Render settings from [cloud deployment](cloud-deployment.md), including
`NODE_ENV=production`, verified database TLS and the backend-only secrets. Check
`https://YOUR_RENDER_SERVICE.onrender.com/api/health` returns status `OK`.
The frontend needs the same origin with **`/api` appended**.

Obtain the actual Cloudflare production URL when creating the Worker. In Render:

```dotenv
FRONTEND_ORIGINS=https://duri-ai.YOUR_SUBDOMAIN.workers.dev
FRONTEND_URL=https://duri-ai.YOUR_SUBDOMAIN.workers.dev
```

Use your real hostname. Add an intended staging/custom domain as a separate,
exact comma-separated origin when needed. Keep the old Vercel origin during a
transition if it is still in use. Do not allow every `workers.dev` origin.
`FRONTEND_URL` is the trusted production origin for emailed reset links; keep it
pointing to production when adding staging CORS access. Save and redeploy Render.

The backend already handles cross-origin Bearer authorization, JSON preflights
and credentialed requests. No API proxy is added on Cloudflare. An `/api/...`
request to the frontend hostname is not a Render API request; do not use a
relative API base URL.

## 2. Configure the production build

The frontend is at the **repository root**. Use Node.js **24.x** and `npm ci`.
Wrangler is a locked development dependency; the `wrangler.jsonc` asset directory
is `./dist`, with the React Router SPA fallback enabled. There is no Worker script.
The compatibility date is pinned to the installed runtime's supported date.

In Cloudflare **Workers & Pages**, create/connect a **Worker** using your existing
GitHub repository. Choose the branch with this configuration (normally `main`
after merging). Avoid scaffolding another React application or creating an API.
Use these Workers Builds settings:

| Setting                | Value                                    |
| ---------------------- | ---------------------------------------- |
| Worker name            | `duri-ai` (must match `wrangler.jsonc`)  |
| Root directory         | Repository root, `.`                     |
| Node version           | `24`, matching `.nvmrc` / `package.json` |
| Build command          | `npm run build:cloudflare`               |
| Deploy command         | `npx wrangler deploy --env=""`           |
| Static asset directory | `dist`, already configured in Wrangler   |

If the dashboard exposes an install-command override, use `npm ci`. Otherwise
use its npm/lockfile installation. Keep development dependencies enabled so Vite
and Wrangler are installed. Set this **build variable**, replacing the example:

```dotenv
VITE_API_URL=https://YOUR_RENDER_SERVICE.onrender.com/api
```

A Worker **runtime** variable cannot change a Vite bundle that was already built.
Rebuild and deploy after changing the API URL. Cloudflare builds reject missing,
non-HTTPS, localhost, credentialed or incorrectly suffixed API URLs.

`VITE_*` values are public browser configuration. Database passwords, JWT secrets,
Supabase service keys, device credentials, SMTP passwords and VAPID private keys
must stay on Render. No Supabase browser key is required. Keep Cloudflare account
credentials in its build integration or your local CLI configuration, not Git.

## 3. Local preview and CLI deployment

For local development, copy `.env.example` to `.env.local` and keep using
`npm run dev`. Local environment files remain ignored; the previous tracked
`.env.local` is removed from Git tracking while the local copy is preserved.

For a local production build, create an ignored `.env.cloudflare.local` file:

```dotenv
VITE_API_URL=https://YOUR_RENDER_SERVICE.onrender.com/api
```

Run from the repository root:

```sh
npm ci
npm run build:cloudflare
npm run cf:preview
```

Open the local address printed by Wrangler. This previews the built assets,
SPA fallback, manifest and service worker through the Cloudflare runtime. Your
Render CORS settings must include that local origin if you test its API from
this preview. Add only the local origins you intend to support.

To publish using your own authorized Cloudflare CLI session, run:

```sh
npm run cf:deploy
```

This rebuilds the frontend before `wrangler deploy`. It publishes the production
Worker; it is not a preview command. To inspect deployment output without
publishing, build first, then run `npx wrangler deploy --env="" --dry-run`.

## 4. Separate staging builds

`wrangler.jsonc` defines the separate `duri-ai-staging` Worker under `env.staging`.
Create an ignored `.env.cloudflare-staging.local` file with the staging Render
API URL, then run:

```sh
npm run cf:deploy:staging
```

For a separate staging Workers Builds project, use worker name `duri-ai-staging`,
build command `npm run build:cloudflare:staging`, deploy command
`npx wrangler deploy --env staging`, and its own `VITE_API_URL` build variable.
Use an isolated staging backend/database for testing writes. Preview builds must
also select an intended API URL and have their exact origin allowed by the API;
this setup does not automatically trust arbitrary branch-preview hostnames.

The CLI commands rebuild for their selected mode. If a process-level
`VITE_API_URL` is set, it overrides the local mode file; verify it targets the
intended environment before deploying. Staging files do not change production.

## 5. PWA, images and notification behavior

The existing `public/sw.js`, manifest, icons, generated precache and UI remain.
Vite copies `public/_headers` into `dist`; Workers Static Assets applies its rules:

- `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`, root scope.
- `/manifest.webmanifest`: `Cache-Control: no-cache`.
- `/assets/*`: immutable caching for Vite's fingerprinted files.

New versions wait for normal service-worker activation rather than forcibly
reloading a farmer's form. The worker caches the public app shell only; private
API records and Supabase signed image URLs are not cached. Offline data editing
and synchronization are not part of this migration. HTML asset normalization is
disabled so the existing `/index.html` precache URL remains directly readable.

A different domain is a different browser origin. Farmers must **log in again**,
install the PWA again if desired, and enable push from Settings on the Cloudflare
origin. Existing VAPID keys and authenticated subscription endpoints remain on
Render. Login state, cached records and subscriptions are not transferred from
Vercel automatically. Keep the previous deployment available until validation.

An enabled, permitted service worker can receive and display notifications while
the PWA's window is closed on supported platforms. A browser that is force-stopped,
OS power policies, revoked permissions, an expired backend session or provider
failure can prevent delivery. Render's free service can sleep: the push outbox
cannot process jobs until the backend is running. Cloudflare asset hosting does
not keep Render awake. Background delivery must be verified on real devices.

Supabase private images continue to use owner-checked, short-lived signed URLs.
The frontend refreshes image access through the Render API after expiry/failure.
No database migration or Storage policy change is needed for this hosting move.

## 6. Verification and rollout

1. Run `node --test tests/*.test.js`, `npm run lint` and a production build.
2. Build with a real HTTPS API URL and inspect `npx wrangler deploy --env="" --dry-run`.
3. Run the existing browser PWA workflow with `PWA_SERVER=wrangler` to test actual
   Static Assets serving. It uses disposable PostgreSQL, a Storage emulator,
   simulated browser subscriptions and synthetic push; no farmers receive alerts.
4. Check login/logout, direct navigation/refresh at `/dashboard`, `/map`,
   `/map/events/ID`, `/analytics`, `/settings` and password-reset routes.
5. Check manifest/icons, JavaScript MIME types, service-worker headers, precached
   build assets, image refresh, notification consent/disable and logout isolation.
   SPA fallback can return HTML for unknown URLs, so a `200` alone is not proof
   that an asset or API exists.
6. On the staging HTTPS origin, verify real Render CORS, SMTP reset links, private
   Supabase images, a closed-PWA push and event click-through on Android/desktop.
7. Promote the tested build, update Render's production frontend origin settings,
   and monitor startup/API errors. Retain the previous host for rollback until
   the new domain has been verified.

Local browser command examples (PostgreSQL role must create disposable databases;
Playwright/Chromium must already be available):

```powershell
# Windows PowerShell, from the repository root
$env:PWA_SERVER = "wrangler"
node tests/cloudPwa.browser.cjs
```

```sh
# POSIX shell, from the repository root
PWA_SERVER=wrangler node tests/cloudPwa.browser.cjs
```

Configure `DB_HOST`, `DB_PORT`, `DB_USER` and `DB_PASSWORD` for the disposable local
test server. Never point integration tests at your production database. Test
helpers explicitly disable external delivery and inherited cloud connections.
