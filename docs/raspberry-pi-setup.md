# Raspberry Pi setup and durable event delivery

The camera is attached to the ESP32. The intended route is **ESP32 sensors/camera
→ Pi processing/inference → Render API → Supabase → farmer PWA**. The Pi does not
run the cloud backend or hold database, JWT, SMTP or Supabase service credentials.

This repository supplies a durable **processed-event sender** and authenticated
heartbeats. It does not yet supply your ESP32 camera receiver or TensorFlow Lite
inference adapter. The ESP32 transport, camera pinout and model preprocessing/
output labels must be confirmed before implementing those hardware-specific parts.
The old `Duri (1)/sketch.ino` is a legacy simulation, not production firmware.

## 1. Prepare the installed Pi OS

Run `uname -m` and `node --version` on the Pi. Use Raspberry Pi OS 64-bit
(`aarch64`) and Node **24.x**, which includes SQLite. Install Git and clone this
repository. The sender uses Node built-ins and the shared event validator;
you do not need to install the backend dependencies or start `backend/app.js`.

Verify `curl --fail --max-time 120 https://YOUR_RENDER_SERVICE.onrender.com/api/health`
works. Resolve Render/database startup errors before testing event delivery.

## 2. Provision an isolated simulation

The backend operator configures a staging database and private Storage, starts
the updated backend/migrations and creates a farmer, plot and node using **Backend
records**. From the configured backend operator terminal, run:

```sh
npm run gateway -- create --farmer-id FARMER_ID --node-ids NODE_ID --name "Pi setup test" --simulation
```

Replace IDs with actual records. Provide the resulting credential securely to
the Pi operator. Only the gateway credential belongs on the Pi. Keep real gateways
and simulation gateways separate; never reuse an outbox across them.

## 3. Configure the sender

On the Pi, copy `pi/.env.example` to a private file **outside the checkout**, for
example `/etc/duri-ai/pi.env`. Set the actual Render origin (no `/api` suffix),
gateway credential, assigned node IDs, `PI_SIMULATION=true` and an absolute
`PI_OUTBOX_PATH`, such as `/var/lib/duri-ai/outbox.sqlite`. Restrict the configuration
to its service user (`chmod 600`). Do not commit it or put credentials in commands,
screenshots, journal messages or chat.

For manual setup, a user-owned config/outbox directory also works. These examples
use `/etc/duri-ai/pi.env`; replace that path if you chose a different private file.

```sh
# From the repository root. The node ID must belong to this simulation gateway.
node --env-file=/etc/duri-ai/pi.env backend/scripts/simulate-event.cjs \
  --node-id NODE_ID --image tests/fixtures/capture.png --outbox
node --env-file=/etc/duri-ai/pi.env pi/run.cjs status
node --env-file=/etc/duri-ai/pi.env pi/run.cjs once
node --env-file=/etc/duri-ai/pi.env pi/run.cjs status
```

The generated test artwork and predictions are **simulation only**. Run the enqueue
command once to create one event; rerun `once`/`worker`, not the simulator, to retry.
`SENT` means the backend acknowledged a committed event; it does not mean a farmer
saw a notification. Confirm the simulated event/image in Harvest Logs and test
background push separately on a subscribed staging phone.

## 4. Keep sending after restart

Run `node --env-file=/etc/duri-ai/pi.env pi/run.cjs worker` to start the foreground
worker. It sends heartbeats for `PI_NODE_IDS` once per minute (without inventing
battery values/GPS) and processes queued events. A new committed event also refreshes
node connectivity; an old duplicate acknowledgement does not overwrite telemetry.

For boot startup, review `pi/duri-ai-pi.service`. Install the repository at
`/opt/duri-ai`, create its dedicated `duri-ai` user/group and private environment
directory, and install Node 24 at the unit's `ExecStart` path. If Node was installed
through nvm, use a stable executable outside the user's home or adjust the unit
deliberately; `ProtectHome=true` prevents using a home-directory nvm installation.
The environment file must be readable by the service user; systemd creates the
private state directory. Copy the reviewed unit to `/etc/systemd/system/`, then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now duri-ai-pi
sudo systemctl status duri-ai-pi
sudo journalctl -u duri-ai-pi -n 50 --no-pager
```

The process handling ESP32 data must run under the same service identity (or an
explicit, private group arrangement) to enqueue into this outbox. Do not loosen
state-directory permissions to make unrelated accounts share image evidence.

## 5. Attach the real inference adapter

The ESP32 receiver/inference program must create an event JSON file following
[the processed-event contract](raspberry-pi-events.md). Generate its UUID and source
timestamps once, retain the original JPEG/PNG bytes, and enqueue the file **before
any network send**:

```sh
node --env-file=/etc/duri-ai/pi.env pi/run.cjs enqueue /private/path/event.json
```

Only produce `CONFIRMED_HARVEST` when actual vibration evidence and camera inference
agree, with a Durian confidence of at least 90%. Do not invent measurements or use
the simulator's 95% result for real images. Keep uncertain/rejected candidates in
the edge processing workflow; this cloud endpoint accepts confirmed events only.
Switch to an independently provisioned real gateway, `PI_SIMULATION=false` and a
separate empty outbox only after validating the camera/model on the Pi.

## Recovery and capacity

SQLite uses WAL and synchronous commits. A lease recovers interrupted sends after
150 seconds; timeouts/5xx responses back off to five minutes from completion of
the failed attempt. A delta-seconds Retry-After starts when the response arrives;
an HTTP-date Retry-After remains an absolute deadline. These deadlines survive
restart. Retries reuse identical normalized evidence. A credential rotation for
the same gateway works; changing API origin, gateway ID or simulation mode requires
a separate outbox, preventing accidental cross-account uploads.

400/401/403/404/409/413 failures are retained as `FAILED` with their image data.
Inspect the status code and fix the configuration/producer, then explicitly retry:

```sh
node --env-file=/etc/duri-ai/pi.env pi/run.cjs retry EVENT_UUID
```

Never edit an existing ID to describe different evidence. Payloads remain until
acknowledged; successful rows retain only receipt metadata/hash for deduplication.
The queue refuses new evidence above its 256 MiB payload budget instead of silently
dropping it. Monitor disk space, failed rows and power/storage health. The adapter
must retain its source event if enqueue fails. No periodic record or image deletion
is enabled automatically.
