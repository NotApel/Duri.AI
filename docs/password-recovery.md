# Forgot password setup

The login screen's **Forgot password?** link now opens a recovery form. The backend
emails a single-use reset link valid for 15 minutes. Its SHA-256 digest is stored
in PostgreSQL; the raw token is never returned by the API or logged. Resetting
updates the bcrypt password hash and revokes every existing session for that
account. The user logs in again; recovery never creates a login session.

The existing auth card, Montserrat, grid and palette are reused. Registration and
username/password login remain available independently of SMTP configuration.

## Setup in VS Code / Windows

1. Switch to this feature branch and install dependencies in both folders:

   ```powershell
   npm ci
   cd backend
   npm ci
   ```

   Nodemailer is the only new runtime dependency, in the backend. The committed
   backend lockfile includes it. Keep the existing database and `DB_*`/`JWT_SECRET`
   settings in your untracked `backend/.env`; do not replace them with placeholders.
2. Add the following settings to **backend/.env** using your email provider's
   SMTP credentials. This example uses Gmail's implicit TLS endpoint:

   ```dotenv
   FRONTEND_URL=http://localhost:5173
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_FROM=your-address@gmail.com
   SMTP_USER=your-address@gmail.com
   SMTP_PASSWORD=your-google-app-password
   ```

   Use a Google app password where supported by your account, rather than your
   ordinary login password. Other providers work with their own host, port,
   credentials and authorized sender address. For port 587, set `SMTP_SECURE=false`;
   the application requires STARTTLS for remote SMTP. Certificate verification
   stays enabled. Never commit credentials or paste reset links into public logs.
3. `FRONTEND_URL` must be the exact trusted frontend **origin**, without a path,
   query or fragment. Use the Vite port actually printed on startup. HTTPS is
   required for non-loopback origins. Local development can use HTTP on localhost,
   127.0.0.1 or ::1. Keep `FRONTEND_ORIGINS` configured for CORS as described in
   [authentication setup](authentication.md). Never build reset URLs from a request's
   Host header or a user-supplied redirect.
4. Start the backend with `npm start`. Startup applies the additive, repeatable
   `002_password_reset.sql` migration alongside the existing auth migrations before
   listening. It creates `farmer_password_reset`; existing accounts, passwords and
   orchard records are preserved. The DB role needs permission to create this table.
5. Start the frontend from a second terminal at the repository root:

   ```powershell
   npm run dev
   ```

6. On Login, choose **Forgot password?**, enter the registered email and submit.
   Open the email, choose and confirm a new password, then log in with it. Passwords
   require at least eight characters and no more than 72 UTF-8 bytes, matching bcrypt.
   A reset link works once. If the page is refreshed after it clears the link from
   the address bar, reopen the original email link or request another one.

Without SMTP host, sender and a valid frontend origin, recovery reports that email
is not configured. Do not enter fake values just to suppress that message.
External email delivery requires working provider credentials; an API response is
not evidence that a message reached an inbox.

### Local mailbox without sending real email

A local SMTP capture tool such as Mailpit can receive test messages. If Docker is
available, run this yourself:

```powershell
docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Use these backend settings while testing locally:

```dotenv
FRONTEND_URL=http://localhost:5173
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=noreply@duri.test
SMTP_USER=
SMTP_PASSWORD=
```

Restart the backend and open `http://localhost:8025` for the test inbox. Register
with a test email, request recovery, and open the link in the captured message.
This is a local mailbox, not delivery to a real Gmail or farmer inbox. No reset
credential is printed to the API response or backend terminal.

## Behaviour and failure handling

- `POST /api/auth/forgot-password` accepts `{email}` and returns the same `202`
  message for existing and unknown addresses. It acknowledges before account
  lookup/email work, so SMTP response time does not disclose account existence.
  Email processing runs in the API process; there is no separate durable job queue.
  If the process restarts before delivery finishes, request again.
- Requests are limited to ten per IP per 15 minutes and one successfully issued
  email per account per minute. A later delivered link replaces the earlier link.
  Requests during the one-minute cooldown do not resend or invalidate the link.
- SMTP failures roll back the attempted token replacement; an earlier delivered
  link remains valid until expiry/use. Errors are logged using generic messages
  and error codes, without recipient addresses, credentials or raw reset tokens.
  Check SMTP settings and provider limits if email does not arrive. The generic
  response intentionally does not reveal whether an address was found or mailed.
- The email opens `/reset-password#token=…`. The fragment is not sent in HTTP
  requests or referrers, and the form removes it from the address bar after reading
  it. The credential is kept only in component memory until submission/navigation.
  Do not enable request-body logging for recovery endpoints.
- `POST /api/auth/reset-password` accepts `{token,new_password}`. Invalid, expired,
  replaced or consumed links return `400`. Reset attempts are limited to 20 per IP
  per 15 minutes. Rate limits are per backend process; multi-instance deployments
  should use a shared limiter store.
- Password update, token consumption and session revocation commit atomically.
  Database failures roll back all three. Concurrent use of a link succeeds once.
  Login uses the same farmer-row lock so an old-password login already in flight
  cannot create a surviving session after a reset.
- Both forms prevent concurrent duplicate submissions and retain editable fields
  on failures. A reset success clears browser credentials and synchronizes sign-out
  to other tabs. Forgotten-password requests never claim verified inbox delivery.

## Verification

Backend integration tests use a disposable PostgreSQL database and a local SMTP
sink; they do not send email externally:

```powershell
cd backend
npm test
```

Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME=postgres` in the test
process or your existing local config. The test role must be able to create/drop
its uniquely named test databases. Do not run integration tests using a production
administrator. Existing farmer data is not reset or seeded.

`tests/passwordRecovery.browser.cjs` additionally starts the actual backend and
Vite, receives an SMTP message locally, opens its link in Chromium and checks the
complete UI/database flow, expired/reused links, failed-request retries, duplicate
submit protection, cross-tab sign-out and 320/390/1440-pixel layouts. It requires
Playwright and Chromium as external test tools, not application dependencies:

```sh
NODE_PATH=/path/to/test-tools/node_modules node tests/passwordRecovery.browser.cjs
```

Override `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. The tests prove
local SMTP integration; they do not verify credentials or inbox delivery with a
real external email provider.
