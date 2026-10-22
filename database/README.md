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
