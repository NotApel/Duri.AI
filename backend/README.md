# Duri.AI Backend API Documentation

Backend API untuk sistem Duri.AI. Dibina menggunakan Node.js, Express.js, dan PostgreSQL.

## Base URL
`http://localhost:3000/api`

## Autentikasi (Authentication)
Kebanyakan endpoint memerlukan **JWT Token**.
Sertakan header: `Authorization: Bearer <token>`

Khas untuk Hardware (ESP32), gunakan **API Key**:
Sertakan header: `x-api-key: duri-ai-device-secret-2026`

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