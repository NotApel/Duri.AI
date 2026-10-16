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

## Frontend presentation: simulated detections

Run `npm ci` and `npm run dev` from the repository root. Open the application at
`/map` (select **Orchard Map**) for current detections, or `/analytics`
(select **Harvest Logs**, labelled **Logs** on mobile) for a simple four-column log. This
presentation workflow does not require the backend or a successful login; it is
not an authenticated production feature.

- Explore five fixed, explicitly labelled scenarios: candidate, verifying,
  confirmed simulation, rejected, and failed camera verification.
- Filter by review state, system status, node, or Malaysia event date.
- Open an event to inspect scripted camera results and sample vibration evidence.
  No camera images or GPS coordinates are fabricated.
- Submit Confirm durian, False alarm (with category), or Unsure. Optional notes
  are limited to 500 characters. Feedback is stored only in this browser under
  `duriai.simulation.feedback.v1`; revisit the event in Orchard Map to find it.
  Revisions replace the demo response, not the original system evidence.
- Offline indicators describe local fixtures only. Nothing syncs to a server;
  no notification, inference, model training, or hardware update is performed.
- Browser storage must be available. Read failures block feedback loading rather
  than overwriting unreadable records; write failures retain form selections for retry.

Checks: `npm run build`, `node --test tests/demoFeedback.test.js`, and
`npx eslint src/components/Detections.jsx src/services/demoFeedback.js src/data/demoDetections.js src/components/AppLayout.jsx src/App.jsx`.
The repository-wide lint command has pre-existing errors outside this workflow.

### Presentation walkthrough

1. Open Orchard Map, scroll to Current detections, and point out the Simulation mode banner and five evidence states.
2. Open SIM-104. Explain that camera verification is scripted and no image/GPS is available.
3. Choose False alarm → Animal, add a note, and save simulated feedback.
4. Open Harvest Logs to see Date, Time (MYT), Detection type, and Node. Filter by
   detection type and export the same four columns to CSV or PDF.
5. Open SIM-101 to demonstrate that a camera timeout stays failed/unknown.

Automated Chromium checks passed at 320px, 390px, and 1440px widths, including
feedback persistence/revision, history and date/status filters, empty results,
unknown events, corrupt storage, failed writes, and local feedback after going
offline in an already loaded page. This does not establish offline reload support.

Detection details and feedback stay in Orchard Map (`/map/events/:eventId`).
Legacy detection and analytics detail links redirect there. Harvest Logs loads
directly from simulation events without reading feedback storage, so corrupt or
blocked local storage cannot prevent logs from displaying. Logs and exports contain
only date, time, detection type, and node. Unfinished verification is labelled Awaiting
verification; a failed camera result is Unknown, never Durian.


## UI conventions

The frontend follows `.agents/skills/uncodixfy/SKILL.md`: solid orchard-green
navigation, light neutral backgrounds, Montserrat throughout, plain headings,
consistent labelled fields, simple bordered tables, and visible keyboard focus.
Shared colors, spacing, navigation, and form/table classes live in `src/index.css`;
detection-specific styles remain in `src/components/Detections.css`. No new UI
framework or dependency is required.

The dashboard opens in labelled simulation mode with populated nodes, recent
events, and the original sample weekly chart for presentations. Choose Backend
in Data source to read the existing APIs, with loading, retry, and empty states.
Simulation and backend records are kept separate.
Node updates and settings remain explicitly local demonstrations. Password recovery
shows its unavailable state rather than submitting a login request.

UI validation includes Chromium checks at 320px, 390px, and 1440px for all six
screens; login and dashboard requests are mocked during browser checks. These
checks validate frontend interactions, not production authentication or hardware.


If the app appears blank locally, share the browser console error and the page URL.
For dependency/cache issues after pulling, stop Vite, run `npm ci`, then
`npm run dev -- --force` and open the exact URL Vite prints. This project’s Vite
version requires Node 20.19+ or 22.12+ (Node 24 was tested). Unknown routes show a
Page not found screen; React rendering errors show a reload screen and log the
underlying error to the console. These fallbacks do not fix missing dependencies
or a dev server that cannot start.
