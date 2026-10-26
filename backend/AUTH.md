# Registration, login, and logout

Implements the supplied UC-01 Register, UC-02 Login, and UC-03 Logout sequence
and use-case documents. Existing CSS, palette, and grid layout are unchanged.
The registration form adds the specification-required username input; login now
uses username instead of email.

## Run

1. Install with `npm ci` in the root and `backend/`.
2. Start PostgreSQL with the existing `database/farmer.sql` table (or the full
   repository schema). Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and
   `DB_PASSWORD` in the backend process or existing local `backend/.env`.
   `.env.example` lists names and safe placeholders. `DATABASE_URL` alone is not
   used by this backend.
3. Run `npm start` from `backend/`. Startup applies the additive, repeatable
   `migrations/001_auth_sessions.sql` transaction before listening: case-insensitive
   unique indexes on username/email and a `farmer_session` table. It does not
   delete, reset, or seed farmer records. If existing usernames/emails collide when
   lowercased, startup fails; resolve those duplicates deliberately before retrying.
4. Run `npm run dev` from the repository root. `FRONTEND_ORIGINS` must include the
   exact frontend origin (default localhost:5173 and 127.0.0.1:5173).
   Optional frontend `VITE_API_URL` overrides the API base URL; otherwise it uses
   the browser hostname on port 3000. Frontend and API should use the same hostname.
5. Register an account, then log in with its username and password.

The existing public home page is `/` (the same sign-in layout). Forgot Password
opens `/forgot-password`; emailed links open `/reset-password`. See the
[password recovery setup](../docs/password-recovery.md) for SMTP configuration and
single-use reset credentials. Register success appears on `/login`; it never logs
the farmer in automatically. Cancelling logout makes no logout request.
Failed logout leaves the session and current page active and displays an error.

## API contract

| Method | Endpoint | Request / result |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ full_name, username, email, password, phone_number }`; 201 with success message and public farmer details, no session |
| POST | `/api/auth/login` | `{ username, password }`; 200 with public farmer details and HTTP-only session cookie |
| GET | `/api/auth/session` | 200 with public farmer details, 401 for missing/expired sessions |
| POST | `/api/auth/logout` | 200 after database session deletion and cookie clearing; 503 on database failure without clearing the cookie |

Validation: all five registration fields required; username 3–50 ASCII letters,
numbers, dots, underscores, or hyphens; valid email up to 200 characters; full name
up to 200 characters; phone up to 20 characters with at least seven digits.
The documents leave password requirements unspecified; this implementation uses
8–128 characters and preserves password whitespace. Usernames/emails are trimmed,
stored lowercase, and checked case-insensitively. Duplicates return 409, invalid
fields 400, invalid credentials 401, and server/database errors 503.

Passwords are salted and hashed using Node's built-in scrypt. Raw passwords are
never returned or stored. Legacy plaintext `password_hash` records are deliberately
not accepted by the new login verifier; existing demo accounts using that format
must be replaced through an explicit account migration/reset process. No legacy
passwords are silently altered. Do not send `password_hash` from the frontend.

Sessions last 12 hours, persist in PostgreSQL, and use random opaque tokens in
HTTP-only SameSite=Lax cookies scoped to `/api`. Only SHA-256 token hashes are
stored in the database. Cookies are Secure in production (HTTPS required).
Login rotates this browser's existing session transactionally. Logout revokes
that session; replay is rejected. No authentication token is put in browser
storage. API calls include cookies; missing/expired sessions return the farmer
to login. Refresh/focus checks restore or revalidate the session.

Authenticated routes now require a session, including simulated frontend pages.
`/api/health` remains public. This change adds authentication; per-farmer data
ownership enforcement for the existing non-authentication endpoints remains a
separate task. Do not deploy those endpoints as a multi-tenant service until
that authorization work is complete.

## Verify

- Root: `npm run build`, `npm run lint`, `node --test tests/demoFeedback.test.js`.
- Backend: `npm test` with database configuration in the process/environment.
  Tests create and drop an isolated `auth_test_*` schema; the DB role needs CREATE
  SCHEMA permission. Existing application records are untouched.
- Browser: register and cancel; duplicate username/email; wrong password; login;
  refresh; cancel logout; confirm logout; retry after failed logout; navigate Back
  or directly to a protected route after logout.

Database/API tests exercise real PostgreSQL, including simulated database outages.
Browser verification uses the real API/database for account/session behavior and
intercepts a logout response only to exercise the failure UI. Test accounts are
removed after the run. Layouts are checked at phone and desktop widths.
