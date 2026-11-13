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
  await deliverOne(f.box, sender, { clock: () => 0 });
  assert.equal(f.box.status()[0].status, "PENDING");
  f.reopen();
  assert.equal(await deliverOne(f.box, sender, { clock: () => 999 }), false);
  await deliverOne(f.box, sender, { clock: () => 1000 });
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
  await deliverOne(f.box, sender, { clock: () => 0 });
  f.reopen();
  assert.equal(f.box.status()[0].next_attempt_at, 60000);
  assert.equal(await deliverOne(f.box, sender, { clock: () => 59999 }), false);
  sender.send = async () => new Response(null, { status: 409 });
  await deliverOne(f.box, sender, { clock: () => 60000 });
  assert.equal(f.box.status()[0].status, "FAILED");
  assert.ok(f.box.db.prepare("SELECT payload FROM event").get().payload);
  f.box.retry(f.box.status()[0].event_id);
  assert.equal(f.box.status()[0].status, "PENDING");
});
test("a slow response starts delta-seconds Retry-After on receipt, including after restart", async (t) => {
  const f = fixture(t),
    input = payload();
  let now = 1000;
  f.box.enqueue(input, now);
  const sender = {
    simulation: true,
    send: async () => {
      now = 91000;
      return new Response(null, {
        status: 503,
        headers: { "Retry-After": "60" },
      });
    },
  };
  await deliverOne(f.box, sender, { clock: () => now });
  assert.equal(f.box.status()[0].next_attempt_at, 151000);
  f.reopen();
  now = 150999;
  assert.equal(await deliverOne(f.box, sender, { clock: () => now }), false);
  now = 151000;
  sender.send = async (body) => ack(body.source_event_id, 200);
  await deliverOne(f.box, sender, { clock: () => now });
  assert.equal(f.box.status()[0].status, "SENT");
});
test("HTTP-date Retry-After remains an absolute deadline after a slow response", async (t) => {
  const f = fixture(t),
    start = Date.parse("2026-11-13T01:00:00Z");
  let now = start;
  f.box.enqueue(payload(), now);
  await deliverOne(
    f.box,
    {
      simulation: true,
      send: async () => {
        now += 90000;
        return new Response(null, {
          status: 429,
          headers: { "Retry-After": new Date(start + 180000).toUTCString() },
        });
      },
    },
    { clock: () => now },
  );
  assert.equal(f.box.status()[0].next_attempt_at, start + 180000);
});
test("network timeouts and malformed Retry-After back off from failure completion", async (t) => {
  for (const header of [null, "invalid", "9".repeat(400)]) {
    await t.test(String(header).slice(0, 12), async (sub) => {
      const f = fixture(sub);
      let now = 1000;
      f.box.enqueue(payload(), now);
      await deliverOne(
        f.box,
        {
          simulation: true,
          send: async () => {
            now = 91000;
            if (header === null) throw new Error("Network timeout");
            return new Response(null, {
              status: 503,
              headers: { "Retry-After": header },
            });
          },
        },
        { clock: () => now, jitter: 500 },
      );
      assert.equal(f.box.status()[0].next_attempt_at, 92500);
      assert.equal(f.box.status()[0].status, "PENDING");
    });
  }
});
test("a delayed acknowledgement records its actual completion time", async (t) => {
  const f = fixture(t);
  let now = 1000;
  f.box.enqueue(payload(), now);
  await deliverOne(
    f.box,
    {
      simulation: true,
      send: async (body) => {
        now = 91000;
        return ack(body.source_event_id);
      },
    },
    { clock: () => now },
  );
  assert.equal(
    f.box.db.prepare("SELECT sent_at FROM event").get().sent_at,
    91000,
  );
});
test("malformed success and a mismatched simulation acknowledgement never discard evidence", async (t) => {
  const f = fixture(t),
    input = payload();
  f.box.enqueue(input, 0);
  const sender = {
    simulation: true,
    send: async () => ack(input.source_event_id, 201, false),
  };
  await deliverOne(f.box, sender, { clock: () => 0 });
  assert.equal(f.box.status()[0].status, "PENDING");
  assert.equal(f.box.status()[0].last_error, "INVALID_ACK");
  sender.send = async () =>
    new Response("<html>not an API</html>", { status: 200 });
  await deliverOne(f.box, sender, { clock: () => 1000 });
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
