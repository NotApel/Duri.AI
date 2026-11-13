# Database

This folder contains the PostgreSQL database files for the Duri.AI system.

## Files

- Database schema (CREATE TABLE statements)
- Entity Relationship Diagram
- Database overview

## Upgrading an existing farmer table

`CREATE TABLE` scripts describe a new database; they do not upgrade existing
tables. Backend startup runs `backend/migrations/000_farmer_username.sql` followed
by `001_auth_sessions.sql` transactionally before listening. This adds a missing
username column and unique usernames for legacy accounts without resetting farmer
records or passwords. See [authentication setup](../docs/authentication.md) for
migration behavior, collision handling and local configuration.

## Reference feedback categories

Startup also runs `005_feedback_categories.sql` when the feedback-category table
exists. It adds missing Animal, Wind, Rain and Other categories without replacing
existing IDs, case variants, descriptions or farmer records. No demo seed is
needed to enable No Durian feedback on a fresh full-schema database.

## Battery measurement time

`006_battery_measurement_time.sql` adds nullable `sensor_node.battery_recorded_at`.
Restarting the updated backend applies it automatically. Existing battery values
are preserved with an unknown measurement time; no historical timestamp is invented.
Connectivity-only heartbeats preserve both fields. A supplied measurement updates
the percentage and time together; explicit null clears both.
