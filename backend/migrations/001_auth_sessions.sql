-- Additive migration. Existing farmer accounts and passwords are not overwritten.
CREATE UNIQUE INDEX IF NOT EXISTS farmer_username_lower_key ON farmer (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS farmer_email_lower_key ON farmer (lower(email));
CREATE TABLE IF NOT EXISTS farmer_session (
  token_hash CHAR(64) PRIMARY KEY,
  farmer_id BIGINT NOT NULL REFERENCES farmer(farmer_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS farmer_session_expiry_idx ON farmer_session(expires_at);
