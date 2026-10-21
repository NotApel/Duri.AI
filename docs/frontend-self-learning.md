# Self-learning frontend integration

These changes target `feature/self-learning-loop`, not main. They do not modify
backend code, database tables, Python scripts, or model files. The layout and
palette are retained; a narrow-grid overflow fix constrains the image upload and
feedback content.

## What the frontend now does

- Orchard Map and Harvest Logs both read `/api/detections` through the same
  normalization adapter. Logs/CSV/PDF contain date, time (MYT), detection type,
  and node. These are the latest records returned by the API (currently up to ten),
  not a claim that all historic events have been returned.
- Missing prediction, node, confidence, and vibration readings show unavailable
  states. No raw vibration values are fabricated.
- HTTP, network, malformed-response, and empty-data states are distinct. Requests
  time out; unmounted initial requests are aborted. Failed feedback retains the
  form, and repeated submits are blocked while pending/after success.
- Training-service failure does not fail the orchard dashboard. Optional training
  values show Unavailable rather than zero or an invented accuracy.
- Training counts come from the backend. A queue record is labelled a record,
  not an image; zero pending records does not imply training completed.
- The backend's existing `currentAccuracy`, `lastRetrained`, and `accuracyHistory`
  fields are known placeholders, so they are not displayed as measured results.
- A successful retrain response is described as backend-reported command
  completion, not proof of model improvement. No weekly schedule is claimed.
- Uploads accept JPEG/PNG up to 5 MB in the frontend. Server validation is still
  required. Uploading an image is not presented as real camera inference.

## Farmer identity and authentication

This branch predates main's username/session rewrite. Its backend still expects
`{email, password_hash}` for login and does not establish a protected session.
The frontend retains that branch-specific request contract; it does not modify
or downgrade main's authentication code.

On successful login, only the backend-returned farmer ID is kept in sessionStorage
for feedback attribution. No ID 1 fallback exists. Log out clears it. Users with
old open tabs must log in again before submitting feedback. A stored farmer ID
is not an authentication credential or an authorization guarantee: the backend
must validate the farmer and enforce ownership. Session-based authentication/CORS
must be coordinated when integrating this branch with main.

API base defaults to the browser hostname, port 3000, `/api`. Override with
`VITE_API_URL` if necessary. Requests retain this branch's legacy CORS contract.

## Backend handoff (not implemented here)

1. Insert feedback and queue records transactionally; report whether an image was
   accepted/queued. Make feedback writes idempotent and validate uploads server-side.
2. Replace the hardcoded Windows Python/script paths with deployment configuration;
   ship the script/model runtime, training status, and evaluation results.
3. Enforce authenticated farmer ownership; never trust `farmer_id` solely because
   the frontend sent it.
4. Provide category IDs from a category endpoint. The current UI retains the
   existing seed mapping from `database/data.sql`: Wind=1, Animal=2, Human Activity=3,
   Other=4. The backend developer must confirm it matches the deployed DB.
5. To populate measured accuracy, return an `evaluations` array with records like:
   `{model_version: "v2", evaluated_at: "2026-10-21T03:00:00Z", sample_count: 100,
   accuracy: 92}`. Accuracy is percent (0–100), the sample count must be positive,
   and every record requires a model version and valid timestamp. Return actual
   evaluated results, not the example values above. Until then the UI shows
   Unavailable and keeps the evaluation area visible.

## Verification

- `node --test tests/selfLearningData.test.js tests/demoFeedback.test.js`
- Focused ESLint on changed components and services.
- `npm run build -- --outDir /tmp/duri-self-learning-build` (this branch tracks
  dist files, so use a separate output directory to avoid changing them).
- Browser checks use mocked API responses: shared map/log records, absent
  evidence, actual login-response farmer ID, feedback failure/retry, optional
  training failure, placeholder suppression, and mobile/desktop layout.
  They do not execute or validate real Python retraining.
