# Authentication setup and schema compatibility

The active backend uses bcrypt for new password hashes and signed JWTs carried in
`Authorization: Bearer <token>`. Each login also creates a server-side session row
containing the token's SHA-256 digest, farmer ID and expiration. Authentication
requires both a valid JWT and an unexpired row. Logout deletes that row before the
browser clears its credentials. This keeps the existing JWT approach while making
logout effective at the server. No login bypass or preview entry was added.

The login/register layouts, Montserrat, grid and palette are unchanged. One React
authentication provider handles login, session restoration and logout. Stored
profile JSON is never trusted as proof of authentication. Reload and tab focus
validate the token against the backend; storage changes synchronize logout across
tabs. Transient server/network errors remain retryable instead of reporting a
successful login or logout.

## Run locally (including Windows/VS Code)

1. Run `npm ci` in the repository root and `backend/` after pulling this fix.
   Nodemon is updated to version 3; the lockfile is included.
2. Keep the existing PostgreSQL database and farmer records. Configure the backend
   with `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET`
   in its existing local `backend/.env`, or in process environment variables.
   The variable names and safe placeholders are in `backend/.env.example`.
   Alternatively, configure `DATABASE_URL`; it takes precedence over `DB_*`.
   Supabase and production require `DB_SSL=true` with certificate verification.
   See [cloud deployment](cloud-deployment.md) for hosted configuration.
3. Generate a unique JWT secret. For example, run this locally and put the result
   in `JWT_SECRET`; do not commit the result:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

4. Run `npm run dev` or `npm start` from `backend/`. Startup runs the repeatable SQL
   migrations in one transaction **before opening the HTTP listener**. A missing
   secret, unavailable database or migration error prevents startup with an error.
5. Run `npm run dev` from the repository root. `FRONTEND_ORIGINS` defaults to both
   `http://localhost:5173` and `http://127.0.0.1:5173`. If Vite prints another port,
   include that exact origin in the comma-separated backend setting. Optional
   frontend `VITE_API_URL` overrides the API URL; otherwise port 3000 on the browser
   hostname is used. Serve production frontend/API over HTTPS.
6. Register, then log in with username/password. Registration creates no login
   token. Old JWTs from before this fix are rejected: log in again once.

`DEVICE_API_KEY` remains a separate credential required by the existing hardware
endpoints. Changing `JWT_SECRET` invalidates previously issued JWTs.

## Fix for PostgreSQL error 42703 (`username` does not exist)

The repository's base `database/farmer.sql` already declares `username`, but older
local tables may lack it. A CREATE TABLE script does not upgrade an existing table.

Startup now runs, under a transaction-level advisory lock:

- `000_farmer_username.sql`: adds `username` if missing, assigns unique
  `farmer_<farmer_id>` names to NULL/blank usernames, then enforces NOT NULL.
  Case-insensitive collisions with existing names get a numeric suffix. Existing
  nonblank usernames are preserved.
- `001_auth_sessions.sql`: adds the existing case-insensitive unique username/email
  indexes and `farmer_session` table/index.

The scripts are repeatable. They do not delete/recreate farmer tables, change IDs,
reset passwords, seed new farmers, or modify plot/node/detection records. If
existing nonblank usernames or emails collide when lowercased, the full transaction
rolls back and startup stops. An administrator must deliberately resolve those
collisions before retrying; the code does not silently merge or rename accounts.

An administrator can inspect the assigned usernames without exposing passwords:

```sql
SELECT farmer_id, username, email FROM farmer ORDER BY farmer_id;
```

The original bcrypt hashes and earlier `scrypt$...` hashes both authenticate. Legacy
plaintext values in `password_hash` are not accepted or silently converted; an
administrator must arrange a proper password reset for those accounts. Existing
hashes are untouched by the schema migration. Password recovery uses an emailed,
expiring single-use link when SMTP is configured. It never returns/logs a demo OTP
or reset credential. See [password recovery setup](password-recovery.md).

New passwords require at least eight characters and at most 72 UTF-8 bytes (bcrypt's
limit). Invalid login attempts are limited to five per IP per 15 minutes; successful
logins do not consume that quota. Sessions expire after seven days. The frontend
continues to use browser localStorage for JWT persistence, matching the existing
architecture; it is not an HttpOnly-cookie implementation.

## API contract

| Request                                                                           | Success                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/auth/register` with full_name, username, email, password, phone_number | 201, `{message, farmer}`; no token and no password hash                |
| `POST /api/auth/login` with username, password                                    | 200, `{message, token, farmer}`                                        |
| `GET /api/auth/session` with Bearer JWT                                           | 200, `{farmer}`                                                        |
| `POST /api/auth/logout` with Bearer JWT                                           | 200 after the matching server-side session is deleted                  |
| `POST /api/auth/forgot-password`                                                  | Generic 202 for valid requests; 503 if SMTP recovery is not configured |
| `POST /api/auth/reset-password`                                                   | Reset with an expiring single-use token; revoke existing sessions      |

Protected endpoints use the same JWT middleware. Invalid/expired/revoked tokens
return 401. Database/session-service outages return 503 and do not clear a valid
client login or pretend that logout succeeded. Case-insensitive username/email
conflicts return 409. All auth responses use `Cache-Control: no-store`.

## Validation

- `cd backend && npm test` starts the **real app.js** as a child process, against a
  newly created disposable PostgreSQL database. Configure the DB_* variables for a
  local test server and a role with CREATE DATABASE permission. The supplied
  `DB_NAME` is used only for the admin connection; a generated `duri_auth_test_*`
  database holds all records and is removed afterward. Do not point integration
  tests at a production server.
- Tests cover startup on a table without username; repeated migrations; generated
  username collisions; complete rollback on duplicate email; registration
  validation and password hashing; JWT login/session/protected reads; CORS;
  logout revocation; expired/forged/old tokens; earlier bcrypt/scrypt hashes;
  unavailable unconfigured recovery; and session database failures. Additional
  recovery tests cover real local SMTP, expiration/replay, delivery rollback,
  concurrent resets, old-login races and session revocation.
- `tests/auth.browser.cjs` uses Playwright against a frontend and backend connected
  to a **disposable test database**. It creates a test account. Set
  `DURI_FRONTEND_URL`, `DURI_API_URL`, and `CHROMIUM_PATH` as needed. Playwright is
  an external test tool, not a new application dependency.
- `npm run lint`, frontend build, and existing frontend tests.

This repair covers authentication and startup compatibility. Existing hardware,
sensor fusion, image storage, notification delivery and training functionality are
not verified or changed by these auth tests. It is separate from the pending
`feature/self-learning-loop` frontend work.

The backend production dependency audit reported zero known advisories at the time
of this check. The complete audit still reports three high-severity development
advisories through nodemon → chokidar → braces; npm reports no available fix for
that chain. Updating nodemon removed the older dependency tree but does not make
the full development audit clean. The full audit results should not be represented
as zero vulnerabilities.

Authentication does not itself implement per-farmer record ownership. The existing
resource routes need a separate ownership review before a multi-farmer production
deployment; the auth repair does not claim that broader authorization is complete.

## Password recovery

See [Forgot password setup](password-recovery.md) for SMTP configuration, the
additive reset-token migration and recovery testing. Email delivery must be
configured before the Forgot password flow can send a reset link.

Farm schema migration and updated management/detection contracts are documented in
[the farm management setup guide](farm-management-backend-setup.md). Startup also
applies `003_farm_locations.sql` without resetting existing records.
