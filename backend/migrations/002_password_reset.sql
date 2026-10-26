-- One expiring reset credential per farmer. Only its SHA-256 digest is stored.
-- This migration does not change existing farmer records or passwords.
CREATE TABLE IF NOT EXISTS farmer_password_reset (
    farmer_id BIGINT PRIMARY KEY REFERENCES farmer(farmer_id) ON DELETE CASCADE,
    token_hash CHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
