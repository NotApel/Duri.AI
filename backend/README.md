# Duri.AI Backend API Documentation

Backend API untuk sistem Duri.AI. Dibina menggunakan Node.js, Express.js, dan PostgreSQL.

## Base URL
`http://localhost:3000/api`

## Autentikasi (Authentication)
Kebanyakan endpoint memerlukan **JWT Token**.
Sertakan header: `Authorization: Bearer <token>`

Processed Pi events and node heartbeats use a provisioned per-gateway Bearer
credential. See [the Pi event contract](../docs/raspberry-pi-events.md). The older
shared-key device routes are disabled by default in production.

Farmer `POST /detection` and `POST /detections` are retired (410). They cannot
create model predictions or verified events. Reading detections and submitting
farmer feedback still use the authenticated farmer session.

---

## 1. Authentication Endpoints

### Register
- **Method:** `POST`
- **URL:** `/auth/register`
- **Body:**
```json
{
  "full_name": "Ali Ahmad",
  "username": "ali",
  "email": "ali@test.com",
  "password": "password123",
  "phone_number": "0123456789"
}
