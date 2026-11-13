const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, statSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Outbox } = require("./outbox.cjs");
const { configuration, client, deliverOne } = require("./client.cjs");
function payload() {
  return {
    source_event_id: randomUUID(),
    node_id: "1",
    occurred_at: "2026-11-13T01:00:00Z",
    decision: "CONFIRMED_HARVEST",
    vibration: { detected: true, amplitude: 0, amplitude_unit: "g" },
    camera: {
      prediction: "DURIAN",
      confidence: 95,
      model_version: "SIMULATION",
    },
    images: [
      {
        content_type: "image/png",
        data_base64: readFileSync(
          path.join(__dirname, "../tests/fixtures/capture.png"),
        ).toString("base64"),
        captured_at: "2026-11-13T01:00:00Z",
      },
    ],
  };
}
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "duri-outbox-")),
    file = path.join(dir, "events.sqlite");
  let box = new Outbox(file, "test-gateway");
  t.after(() => {
    box.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    get box() {
      return box;
    },
    file,
    reopen() {
      box.close();
      box = new Outbox(file, "test-gateway");
      return box;
    },
  };
}
const ack = (id, status = 201, simulation = true) =>
  Response.json(
    { source_event_id: id, detection_id: "42", simulation },
    { status },
  );
test("events survive reopening with unchanged evidence; conflicts, another gateway and a full outbox cannot overwrite them", (t) => {
  const f = fixture(t),
    input = payload();
  f.box.enqueue(input, 0);
  f.reopen();
  const saved = JSON.parse(
    f.box.db.prepare("SELECT payload FROM event").get().payload,
  );
  assert.equal(saved.images[0].data_base64, input.images[0].data_base64);
  assert.equal(saved.vibration.amplitude, 0);
  assert.equal(f.box.enqueue(input).duplicate, true);
  assert.throws(() =>
    f.box.enqueue({ ...input, camera: { ...input.camera, confidence: 99 } }),
  );
  assert.throws(() => new Outbox(f.file, "another-gateway"));
  f.box.maxBytes = 1;
  assert.throws(() => f.box.enqueue(payload()));
  assert.equal(f.box.status().length, 1);
  assert.equal(statSync(f.file).mode & 0o777, 0o600);
});
test("an unknown network outcome retries the same ID, timestamp and image; acknowledged payloads leave the active queue", async (t) => {
  const f = fixture(t),
    input = payload(),
    sent = [];
  f.box.enqueue(input, 0);
  const sender = {
    simulation: true,
    send: async (body) => {
      sent.push(body);
      if (sent.length === 1)
        throw new Error("Lost response after server commit");
      return ack(body.source_event_id, 200);
    },
  };
  await deliverOne(f.box, sender, { now: 0 });
  assert.equal(f.box.status()[0].status, "PENDING");
  f.reopen();
  assert.equal(await deliverOne(f.box, sender, { now: 999 }), false);
  await deliverOne(f.box, sender, { now: 1000 });
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(f.box.status()[0].status, "SENT");
  assert.equal(
    f.box.db.prepare("SELECT payload FROM event").get().payload,
    null,
  );
  assert.equal(f.box.enqueue(input).duplicate, true);
});
test("leases recover after process loss and late acknowledgements cannot overwrite the new worker", (t) => {
  const f = fixture(t);
  f.box.enqueue(payload(), 0);
  const first = f.box.claim(0, 1000);
  assert.equal(f.box.claim(500, 1000), undefined);
  f.reopen();
  const second = f.box.claim(1000, 1000);
  assert.notEqual(first.lease_id, second.lease_id);
  f.box.finish(first, "SENT", null);
  assert.equal(f.box.status()[0].status, "PROCESSING");
  f.box.finish(second, "SENT", null);
  assert.equal(f.box.status()[0].status, "SENT");
});
test("Retry-After survives restart; permanent failures retain evidence for an explicit retry", async (t) => {
  const f = fixture(t);
  f.box.enqueue(payload(), 0);
  const sender = {
    simulation: true,
    send: async () =>
      new Response(null, { status: 429, headers: { "Retry-After": "60" } }),
  };
  await deliverOne(f.box, sender, { now: 0 });
  f.reopen();
  assert.equal(f.box.status()[0].next_attempt_at, 60000);
  assert.equal(await deliverOne(f.box, sender, { now: 59999 }), false);
  sender.send = async () => new Response(null, { status: 409 });
  await deliverOne(f.box, sender, { now: 60000 });
  assert.equal(f.box.status()[0].status, "FAILED");
  assert.ok(f.box.db.prepare("SELECT payload FROM event").get().payload);
  f.box.retry(f.box.status()[0].event_id);
  assert.equal(f.box.status()[0].status, "PENDING");
});
test("malformed success and a mismatched simulation acknowledgement never discard evidence", async (t) => {
  const f = fixture(t),
    input = payload();
  f.box.enqueue(input, 0);
  const sender = {
    simulation: true,
    send: async () => ack(input.source_event_id, 201, false),
  };
  await deliverOne(f.box, sender, { now: 0 });
  assert.equal(f.box.status()[0].status, "PENDING");
  assert.equal(f.box.status()[0].last_error, "INVALID_ACK");
  sender.send = async () =>
    new Response("<html>not an API</html>", { status: 200 });
  await deliverOne(f.box, sender, { now: 1000 });
  assert.equal(f.box.status()[0].status, "PENDING");
});
test("Pi configuration binds the API, gateway and simulation mode and sends only gateway auth over approved transport", async () => {
  const env = {
    PI_API_URL: "https://backend.example.invalid",
    PI_GATEWAY_CREDENTIAL: `duri_pi_${randomUUID()}.${"a".repeat(64)}`,
    PI_OUTBOX_PATH: "/tmp/test.sqlite",
    PI_SIMULATION: "true",
  };
  for (const url of [
    "http://remote.example.invalid",
    "https://user:password@host",
    "https://host/api",
    "https://host/?key=secret",
  ])
    assert.throws(() => configuration({ ...env, PI_API_URL: url }));
  const config = configuration(env);
  assert.notEqual(
    config.identity,
    configuration({ ...env, PI_SIMULATION: "false" }).identity,
  );
  let request;
  const sender = client(config, async (url, options) => {
    request = { url, ...options };
    return new Response(null, { status: 201 });
  });
  await sender.send(payload());
  assert.equal(request.url, `${env.PI_API_URL}/api/device/events`);
  assert.equal(
    request.headers.Authorization,
    `Bearer ${env.PI_GATEWAY_CREDENTIAL}`,
  );
  assert.equal(request.headers["x-duriai-simulation"], "true");
  assert.equal(request.redirect, "error");
});
