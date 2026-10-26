# 🌳 Duri.AI

An AI-powered IoT-based durian harvest monitoring system that combines sensor fusion, edge AI, and a Progressive Web App (PWA) to accurately detect fallen durians, reduce false alarms, and provide real-time harvest notifications.

## 🚀 Features

- 🍈 AI-powered durian detection using TensorFlow Lite
- 📡 Sensor fusion to minimize false alarms
- 📱 Progressive Web App (PWA) with offline support
- 🔔 Real-time push notifications with GPS location and image preview
- 🧠 Self-learning feedback system for continuous AI improvement
- 📊 Harvest analytics and reporting dashboard
- 🌐 OTA (Over-the-Air) model updates
- ⚙️ Sensor node and farm plot management

## 🛠️ Tech Stack

### Hardware
- Raspberry Pi 5
- ESP32
- Camera Module
- Vibration Sensor

### Software
- TensorFlow Lite
- Progressive Web App (PWA)
- Service Workers
- Push Notifications
- REST API
- Cloud Database

## 🏗️ System Architecture

```
Sensor Node
├── Camera
├── Vibration Sensor
└── Raspberry Pi 5 (Edge AI)
        │
        ▼
ESP32 Hub
        │
      4G Network
        │
        ▼
Cloud Server
        │
        ▼
Progressive Web App
```

## 📸 Key Features

- AI image verification
- Dual-sensor confirmation
- GPS-based harvest location
- Image preview in notifications
- Offline capability
- Interactive orchard map
- Self-learning feedback loop

## 🧪 Testing

- Unit Testing
- Integration Testing
- System Testing
- Functional Testing
- Regression Testing
- Performance Testing
- Reliability Testing

## 📄 License

This project is developed as a Final Year Project (FYP) at the German-Malaysian Institute (GMI).


## Authentication and existing databases

See [authentication setup](docs/authentication.md) for local configuration,
registration/login/logout, and the automatic migration that fixes older farmer
tables missing `username`. Keep existing farmer records; do not drop or recreate
your database to resolve error 42703. The backend requires `JWT_SECRET` and the
existing `DB_*` settings before startup.

## Detection workflow implementation

Orchard Map and Harvest Logs use the same backend detection records. Farmers can
inspect available images and submit authenticated feedback; logs retain the four
columns date, time, detection type and node, with filtered CSV/PDF exports.
See [detection integration and backend handoff](docs/detection-integration.md).

The feature list above describes project goals. Hardware inference, retraining,
OTA, push notifications and offline PWA operation are not verified by this
frontend integration. Illustrative map geometry and Dashboard demonstration data
remain labelled separately from API records.

## Farm plots, nodes and notifications

The frontend management screens support plot creation/editing/selection, node
registration/assignment, and notification read states with event links. Their
default **Browser simulation** stores account-scoped records locally, separately
from backend detections and Harvest Logs. Choose **Backend records** to use the
available APIs; missing write endpoints report an error without claiming a save.

See the [backend setup and endpoint guide](docs/farm-management-backend-setup.md)
for VS Code/PostgreSQL configuration, required routes, payloads and ownership rules.
This feature does not modify backend code or implement real push/device updates.

## Forgot password

The login screen supports email password-reset links. Configure SMTP in the
backend and follow the [password recovery setup guide](docs/password-recovery.md).
Links expire after 15 minutes, work once, and invalidate existing login sessions
after a successful reset. The login layout and existing authentication remain.
