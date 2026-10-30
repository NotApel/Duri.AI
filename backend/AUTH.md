# Authentication and local setup

The current backend uses bcrypt password hashes and a signed Bearer JWT backed by
an active PostgreSQL session. Logout and password reset revoke server sessions;
password reset also removes their push subscriptions. Existing bcrypt and scrypt
accounts remain supported. No login bypass is provided.

Follow [the current authentication guide](../docs/authentication.md) for local
setup, migration compatibility, API contracts and verification. It supersedes the
older cookie/scrypt-only setup instructions previously in this file.

For Render, Supabase PostgreSQL/private Storage, Vercel and Web Push, follow
[the cloud deployment guide](../docs/cloud-deployment.md). The backend now accepts
`DATABASE_URL` first, with existing `DB_*` settings as a fallback. Supabase and
production require verified database TLS. All private credentials stay in the
backend environment; only `VITE_API_URL` belongs in the frontend environment.
