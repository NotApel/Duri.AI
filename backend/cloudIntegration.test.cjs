const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createECDH, randomBytes, randomUUID } = require("node:crypto");
const webPush = require("web-push");
const { backendFixture } = require("../tests/helpers/backend.cjs");
const { storageEmulator } = require("../tests/helpers/storage.cjs");
const { provisionGateway, credential } = require("./deviceAuth");
const {
  createPushWorker,
  validateSubscription,
  pushConfig,
} = require("./push");
const { validateEvent, digest } = require("./eventValidation");
const { databaseConfig } = require("./databaseConfig");
const png = require("node:fs")
  .readFileSync(
    require("node:path").join(__dirname, "../tests/fixtures/capture.png"),
  )
  .toString("base64");
const keys = webPush.generateVAPIDKeys();
const config = {
  enabled: true,
  publicKey: keys.publicKey,
  privateKey: keys.privateKey,
  subject: "mailto:test@example.invalid",
};
let fixture, storage, owner, other, plot, node, gateway;
function payload(id = randomUUID()) {
  return {
    source_event_id: id,
    node_id: node.node_id,
    occurred_at: "2026-10-28T05:00:00Z",
    decision: "CONFIRMED_HARVEST",
    vibration: {
      detected: true,
      amplitude: 0,
      amplitude_unit: "g",
      frequency_hz: 20.125,
      duration_seconds: 0.2,
    },
    camera: {
      prediction: "DURIAN",
      confidence: 90,
      model_version: "test-model",
    },
    images: [
      {
        content_type: "image/png",
        data_base64: png,
        captured_at: "2026-10-28T05:00:01Z",
      },
    ],
  };
}
function subscription(name) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
}
const own = (method, body) => ({ method, body, token: owner.token });
const ingest = (body, token = gateway.credential) =>
  fixture.request("/device/events", { method: "POST", body, token });
async function register(sub, farmer = owner) {
  return fixture.request("/push/subscriptions", {
    method: "POST",
    token: farmer.token,
    body: { subscription: sub, vapid_public_key: keys.publicKey },
  });
}
async function login(farmer) {
  return (
    await fixture.request("/auth/login", {
      method: "POST",
      body: { username: farmer.username, password: farmer.password },
    })
  ).body.token;
}
before(async () => {
  storage = storageEmulator();
  const url = await storage.start();
  fixture = await backendFixture({
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: storage.key,
    PUSH_ENABLED: "true",
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: config.subject,
  });
  owner = await fixture.account("cloud.owner");
  other = await fixture.account("cloud.other");
  plot = (
    await fixture.request(
      `/farmers/${owner.farmer_id}/plots`,
      own("POST", { farm_name: "Test farm", plot_name: "East", plot_size: 2 }),
    )
  ).body;
  node = (
    await fixture.request(
      `/plots/${plot.plot_id}/nodes`,
      own("POST", { node_name: "Test node" }),
    )
  ).body;
  gateway = await provisionGateway(fixture.pool, {
    farmerId: owner.farmer_id,
    name: "Test Pi",
    nodeIds: [node.node_id],
    isSimulation: true,
  });
});
after(async () => {
  if (fixture) await fixture.close();
  if (storage) await storage.close();
});
test("cloud configuration uses verified TLS and validates event evidence without fake measurements", () => {
  const result = databaseConfig({
    DATABASE_URL:
      "postgresql://test:test@db.example.invalid/postgres?sslmode=no-verify",
  });
  assert.equal(result.ssl.rejectUnauthorized, true);
  assert.doesNotMatch(result.connectionString, /sslmode/);
  assert.throws(() =>
    databaseConfig({ NODE_ENV: "production", DB_SSL: "false" }),
  );
  assert.throws(() => pushConfig({ PUSH_ENABLED: "true" }));
  const input = payload();
  input.vibration = { detected: true };
  assert.equal(validateEvent(input).evidence.vibration.frequency_hz, null);
  assert.equal(validateEvent(input).evidence.vibration.amplitude, null);
  const invalid = [
    { decision: "PENDING" },
    { camera: { prediction: "DURIAN", confidence: 89.99 } },
    { vibration: { detected: false } },
    { images: [] },
    {
      images: [
        {
          content_type: "image/png",
          data_base64: "AAAA",
          captured_at: input.occurred_at,
        },
      ],
    },
    { occurred_at: "yesterday" },
    { farmer_id: other.farmer_id },
  ];
  for (const change of invalid)
    assert.throws(() => validateEvent({ ...payload(), ...change }));
});
test("push subscriptions are authenticated, validated and cannot be stolen by another farmer", async () => {
  assert.equal(
    (await fixture.request("/push/subscriptions", { method: "POST", body: {} }))
      .status,
    401,
  );
  assert.equal(
    (await fixture.request("/push/public-key")).body.public_key,
    keys.publicKey,
  );
  for (const endpoint of [
    "http://127.0.0.1/private",
    "https://example.invalid/push",
    "https://fcm.googleapis.com:444/push",
  ]) {
    const value = subscription("invalid");
    value.endpoint = endpoint;
    assert.throws(() =>
      validateSubscription(
        { subscription: value, vapid_public_key: keys.publicKey },
        config,
      ),
    );
  }
  const sub = subscription("owner-first");
  assert.equal((await register(sub)).status, 201);
  assert.equal((await register(sub)).status, 201);
  assert.equal((await register(sub, other)).status, 409);
  assert.equal(
    (await fixture.request("/push/subscriptions", { token: other.token })).body
      .subscriptions.length,
    0,
  );
  assert.equal(
    (await register(subscription("other-first"), other)).status,
    201,
  );
});
test("simultaneous Pi retries commit one harvest, image and owned notification; Supabase bytes are actually readable", async () => {
  const value = payload();
  const results = await Promise.all(
    Array.from({ length: 6 }, () => ingest(value)),
  );
  assert.equal(results.filter((row) => row.status === 201).length, 1);
  assert.equal(results.filter((row) => row.status === 200).length, 5);
  assert.equal(new Set(results.map((row) => row.body.detection_id)).size, 1);
  for (const table of [
    "sensor_reading",
    "detection",
    "notification",
    "detection_image",
    "gateway_event",
    "push_delivery",
  ])
    assert.equal(
      (await fixture.pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0]
        .n,
      1,
      table,
    );
  assert.equal(storage.objects.size, 1);
  assert.equal(storage.uploads.length, 1);
  const id = results[0].body.detection_id;
  const details = (
    await fixture.request(`/detections/${id}`, { token: owner.token })
  ).body;
  assert.equal(Number(details.amplitude), 0);
  assert.equal(Number(details.frequency), 20.125);
  assert.equal(details.images.length, 1);
  assert.match(details.images[0].image_path, /\/storage\/v1\/object\/sign\//);
  const image = await fetch(details.images[0].image_path);
  assert.equal(image.status, 200);
  assert.equal(
    digest(Buffer.from(await image.arrayBuffer())),
    digest(Buffer.from(png, "base64")),
  );
  const stored = (await fixture.pool.query("SELECT * FROM detection_image"))
    .rows[0];
  assert.doesNotMatch(stored.image_path, /token=|https?:/);
  assert.equal(
    (await fixture.request(`/detections/${id}/images`, { token: other.token }))
      .status,
    404,
  );
  assert.equal(
    (await fixture.request("/notifications", { token: other.token })).body
      .length,
    0,
  );
  assert.equal(
    (await ingest({ ...value, camera: { ...value.camera, confidence: 99 } }))
      .status,
    409,
  );
});
test("invalid or revoked credentials and foreign/disabled nodes cannot create events", async () => {
  assert.equal((await ingest(payload(), owner.token)).status, 401);
  assert.equal((await ingest(payload(), "wrong-key")).status, 401);
  assert.equal((await ingest({ ...payload(), node_id: "999999" })).status, 404);
  assert.equal(
    (
      await ingest({
        ...payload(),
        camera: { prediction: "DURIAN", confidence: 89 },
      })
    ).status,
    400,
  );
  await fixture.request(
    `/nodes/${node.node_id}`,
    own("PATCH", { node_name: node.node_name, is_active: false }),
  );
  assert.equal((await ingest(payload())).status, 404);
  await fixture.request(
    `/nodes/${node.node_id}`,
    own("PATCH", { node_name: node.node_name, is_active: true }),
  );
  const rotated = credential(gateway.gateway_id);
  await fixture.pool.query(
    "UPDATE device_gateway SET key_hash=$1 WHERE gateway_id=$2",
    [rotated.hash, gateway.gateway_id],
  );
  assert.equal((await ingest(payload())).status, 401);
  gateway.credential = rotated.token;
});
test("lost upload acknowledgements and SQL failures can retry without duplicate files or harvests", async () => {
  const value = payload();
  storage.failAfterWrite();
  assert.equal((await ingest(value)).status, 503);
  const before = (
    await fixture.pool.query("SELECT count(*)::int n FROM detection")
  ).rows[0].n;
  assert.equal((await ingest(value)).status, 201);
  assert.equal(
    (await fixture.pool.query("SELECT count(*)::int n FROM detection")).rows[0]
      .n,
    before + 1,
  );
  const failed = payload();
  await fixture.pool.query(
    "ALTER TABLE notification RENAME TO notification_unavailable",
  );
  try {
    assert.equal((await ingest(failed)).status, 503);
  } finally {
    await fixture.pool.query(
      "ALTER TABLE notification_unavailable RENAME TO notification",
    );
  }
  const pending = (
    await fixture.pool.query(
      "SELECT state FROM gateway_event WHERE source_event_id=$1",
      [failed.source_event_id],
    )
  ).rows[0];
  assert.equal(pending.state, "PENDING");
  assert.equal((await ingest(failed)).status, 201);
  assert.equal(
    storage.objects.size,
    (await fixture.pool.query("SELECT count(*)::int n FROM detection_image"))
      .rows[0].n,
  );
  const id = (
    await fixture.pool.query(
      "SELECT detection_id FROM gateway_event WHERE source_event_id=$1",
      [failed.source_event_id],
    )
  ).rows[0].detection_id;
  storage.failSigning();
  assert.equal(
    (await fixture.request(`/detections/${id}/images`, { token: owner.token }))
      .status,
    503,
  );
  assert.equal(
    (await fixture.request(`/detections/${id}/images`, { token: owner.token }))
      .status,
    200,
  );
  assert.equal(
    (
      await fixture.pool.query(
        "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'",
      )
    ).rows[0].n,
    0,
  );
});
test("outbox workers claim once, preserve read state and retry temporary push errors", async () => {
  await fixture.pool.query("UPDATE push_delivery SET status='CANCELLED'");
  const result = await ingest(payload());
  assert.equal(result.status, 201);
  const sent = [];
  const send = async (sub, message) => {
    sent.push({ sub, body: JSON.parse(message) });
    await new Promise((resolve) => setTimeout(resolve, 30));
  };
  const first = createPushWorker(fixture.pool, config, { send }),
    second = createPushWorker(fixture.pool, config, { send });
  await Promise.all([first.tick(), second.tick()]);
  assert.equal(sent.length, 1);
  assert.match(sent[0].sub.endpoint, /owner-first/);
  assert.equal(sent[0].body.farmer_id, owner.farmer_id);
  assert.equal(
    (
      await fixture.pool.query(
        "SELECT is_read FROM notification WHERE notification_id=$1",
        [result.body.notification_id],
      )
    ).rows[0].is_read,
    false,
  );
  await fixture.pool.query(
    "UPDATE push_delivery SET status='PENDING',attempts=0,available_at=NOW() WHERE notification_id=$1",
    [result.body.notification_id],
  );
  const failure = createPushWorker(fixture.pool, config, {
    send: async () => {
      throw Object.assign(new Error("Test provider response"), {
        statusCode: 503,
      });
    },
  });
  await failure.tick();
  const row = (
    await fixture.pool.query(
      "SELECT * FROM push_delivery WHERE notification_id=$1",
      [result.body.notification_id],
    )
  ).rows[0];
  assert.equal(row.status, "PENDING");
  assert.equal(row.last_error, "PROVIDER_503");
  assert.ok(new Date(row.available_at) > new Date());
  await fixture.pool.query(
    "UPDATE push_delivery SET available_at=NOW() WHERE delivery_id=$1",
    [row.delivery_id],
  );
  await first.tick();
  assert.equal(
    (
      await fixture.pool.query(
        "SELECT status FROM push_delivery WHERE delivery_id=$1",
        [row.delivery_id],
      )
    ).rows[0].status,
    "SENT",
  );
});
test("expired provider subscriptions are removed and session logout revokes pending push delivery", async () => {
  await fixture.pool.query("UPDATE push_delivery SET status='CANCELLED'");
  await ingest(payload());
  const expired = createPushWorker(fixture.pool, config, {
    send: async () => {
      throw Object.assign(new Error("Expired"), { statusCode: 410 });
    },
  });
  await expired.tick();
  assert.equal(
    (await fixture.request("/push/subscriptions", { token: owner.token })).body
      .subscriptions.length,
    0,
  );
  const secondSession = { ...owner, token: await login(owner) };
  await register(subscription("owner-second"), secondSession);
  await register(subscription("owner-restored"));
  await ingest(payload());
  const count = (
    await fixture.pool.query("SELECT count(*)::int n FROM push_delivery")
  ).rows[0].n;
  assert.equal(
    (
      await fixture.request("/auth/logout", {
        method: "POST",
        body: {},
        token: owner.token,
      })
    ).status,
    200,
  );
  assert.ok(
    (await fixture.pool.query("SELECT count(*)::int n FROM push_delivery"))
      .rows[0].n < count,
  );
  const remaining = (
    await fixture.pool.query(
      "SELECT farmer_id,session_token_hash FROM push_subscription WHERE farmer_id=$1",
      [owner.farmer_id],
    )
  ).rows;
  assert.equal(remaining.length, 1);
  const sent = [];
  await createPushWorker(fixture.pool, config, {
    send: async (sub) => sent.push(sub.endpoint),
  }).tick();
  assert.deepEqual(sent, ["https://fcm.googleapis.com/fcm/send/owner-second"]);
});

test("completed receipts survive node disablement while new events remain blocked", async () => {
  const receipt = (
    await fixture.pool.query(
      "SELECT source_event_id FROM gateway_event WHERE state='COMPLETED' ORDER BY received_at LIMIT 1",
    )
  ).rows[0];
  await fixture.pool.query(
    "UPDATE sensor_node SET is_active=FALSE WHERE node_id=$1",
    [node.node_id],
  );
  try {
    assert.equal((await ingest(payload(receipt.source_event_id))).status, 200);
    assert.equal((await ingest(payload())).status, 404);
  } finally {
    await fixture.pool.query(
      "UPDATE sensor_node SET is_active=TRUE WHERE node_id=$1",
      [node.node_id],
    );
  }
});
test("failed provider jobs stop retrying, expired sessions cannot send, and abandoned leases recover", async () => {
  owner.token = await login(owner);
  await register(subscription("owner-recovery"));
  await fixture.pool.query("UPDATE push_delivery SET status='CANCELLED'");
  const value = await ingest(payload());
  assert.equal(value.status, 201);
  const rows = (
    await fixture.pool.query(
      "SELECT * FROM push_delivery WHERE notification_id=$1",
      [value.body.notification_id],
    )
  ).rows;
  assert.ok(rows.length);
  // Simulate a backend crash after claiming jobs but before acknowledging delivery.
  await fixture.pool.query(
    "UPDATE push_delivery SET status='PROCESSING',locked_until=NOW()-INTERVAL '1 second',lease_id=gen_random_uuid(),attempts=1 WHERE notification_id=$1",
    [value.body.notification_id],
  );
  const sent = [];
  await createPushWorker(fixture.pool, config, {
    send: async (sub) => {
      const details = webPush.generateRequestDetails(
        sub,
        JSON.stringify({ test: true }),
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
        },
      );
      assert.equal(details.headers["Content-Encoding"], "aes128gcm");
      assert.ok(details.body.length > 0);
      sent.push(sub.endpoint);
    },
  }).tick();
  assert.equal(sent.length, rows.length);
  await fixture.pool.query(
    "UPDATE push_delivery SET status='PENDING',attempts=4,available_at=NOW() WHERE notification_id=$1",
    [value.body.notification_id],
  );
  await createPushWorker(fixture.pool, config, {
    send: async () => {
      throw Object.assign(new Error("Test failure"), { statusCode: 503 });
    },
  }).tick();
  assert.ok(
    (
      await fixture.pool.query(
        "SELECT status FROM push_delivery WHERE notification_id=$1",
        [value.body.notification_id],
      )
    ).rows.every((row) => row.status === "FAILED"),
  );
  await fixture.pool.query(
    "UPDATE push_delivery SET status='PENDING',attempts=0,available_at=NOW() WHERE notification_id=$1",
    [value.body.notification_id],
  );
  await fixture.pool.query(
    "UPDATE farmer_session SET expires_at=NOW()-INTERVAL '1 second' WHERE farmer_id=$1",
    [owner.farmer_id],
  );
  let called = 0;
  await createPushWorker(fixture.pool, config, {
    send: async () => {
      called++;
    },
  }).tick();
  assert.equal(called, 0);
  assert.ok(
    (
      await fixture.pool.query(
        "SELECT status FROM push_delivery WHERE notification_id=$1",
        [value.body.notification_id],
      )
    ).rows.every((row) => row.status === "CANCELLED"),
  );
});
test("a public Storage bucket is refused and cloud tables have RLS enabled", async () => {
  const cloud = storageEmulator();
  const url = await cloud.start();
  cloud.setPublic(true);
  let isolated;
  try {
    isolated = await backendFixture({
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: cloud.key,
    });
    const farmer = await isolated.account("private.bucket");
    const plot = (
      await isolated.request(`/farmers/${farmer.farmer_id}/plots`, {
        method: "POST",
        token: farmer.token,
        body: { farm_name: "Private", plot_name: "Private", plot_size: 1 },
      })
    ).body;
    const sensor = (
      await isolated.request(`/plots/${plot.plot_id}/nodes`, {
        method: "POST",
        token: farmer.token,
        body: { node_name: "Private node" },
      })
    ).body;
    const device = await provisionGateway(isolated.pool, {
      farmerId: farmer.farmer_id,
      name: "Private test",
      nodeIds: [sensor.node_id],
      isSimulation: true,
    });
    const data = { ...payload(), node_id: sensor.node_id };
    assert.equal(
      (
        await isolated.request("/device/events", {
          method: "POST",
          token: device.credential,
          body: data,
        })
      ).status,
      503,
    );
    assert.equal(cloud.objects.size, 0);
    assert.equal(
      (await isolated.pool.query("SELECT count(*)::int n FROM detection"))
        .rows[0].n,
      0,
    );
    cloud.setPublic(false);
    assert.equal(
      (
        await isolated.request("/device/events", {
          method: "POST",
          token: device.credential,
          body: data,
        })
      ).status,
      201,
    );
    const policies = (
      await isolated.pool.query(
        "SELECT relname,relrowsecurity FROM pg_class WHERE relname=ANY($1)",
        [
          [
            "farmer",
            "farmer_session",
            "device_gateway",
            "gateway_node",
            "gateway_event",
            "push_subscription",
            "push_delivery",
          ],
        ],
      )
    ).rows;
    assert.equal(policies.length, 7);
    assert.ok(policies.every((row) => row.relrowsecurity));
  } finally {
    if (isolated) await isolated.close();
    await cloud.close();
  }
});

test("password reset cascades subscription revocation without affecting another farmer", async () => {
  owner.token = await login(owner);
  await register(subscription("owner-password-reset"));
  const otherBefore = (
    await fixture.pool.query(
      "SELECT count(*)::int n FROM push_subscription WHERE farmer_id=$1",
      [other.farmer_id],
    )
  ).rows[0].n;
  const token = randomBytes(32).toString("hex");
  await fixture.pool.query(
    "INSERT INTO farmer_password_reset(farmer_id,token_hash,expires_at) VALUES ($1,$2,NOW()+INTERVAL '15 minutes')",
    [owner.farmer_id, digest(token)],
  );
  const result = await fixture.request("/auth/reset-password", {
    method: "POST",
    body: { token, new_password: "replacement-test-password-2026" },
  });
  assert.equal(result.status, 200);
  assert.equal(
    (
      await fixture.pool.query(
        "SELECT count(*)::int n FROM push_subscription WHERE farmer_id=$1",
        [owner.farmer_id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await fixture.pool.query(
        "SELECT count(*)::int n FROM push_subscription WHERE farmer_id=$1",
        [other.farmer_id],
      )
    ).rows[0].n,
    otherBefore,
  );
  assert.equal(
    (await fixture.request("/push/subscriptions", { token: owner.token }))
      .status,
    401,
  );
});
test("validation preserves microseconds and rejects calendar rollover and malformed IDs", () => {
  for (const value of [
    "2026-02-30T00:00:00Z",
    "2026-10-29T24:00:00Z",
    "0000-01-01T00:00:00Z",
  ])
    assert.throws(() => validateEvent({ ...payload(), occurred_at: value }));
  assert.throws(() =>
    validateEvent({ ...payload(), source_event_id: [randomUUID()] }),
  );
  const a = validateEvent({
    ...payload(),
    occurred_at: "2026-10-29T00:00:00.123456Z",
  });
  const b = validateEvent({
    ...payload(a.evidence.source_event_id),
    occurred_at: "2026-10-29T08:00:00.123456+08:00",
  });
  assert.equal(a.payloadHash, b.payloadHash);
  assert.equal(a.evidence.occurred_at, "2026-10-29T00:00:00.123456Z");
  const different = validateEvent({
    ...payload(a.evidence.source_event_id),
    occurred_at: "2026-10-29T00:00:00.123457Z",
  });
  assert.notEqual(a.payloadHash, different.payloadHash);
});

test("farmer feedback images use private Storage on cloud deployments", async () => {
  owner.password = "replacement-test-password-2026";
  owner.token = await login(owner);
  const id = (
    await fixture.pool.query(
      "SELECT detection_id FROM gateway_event WHERE state='COMPLETED' ORDER BY received_at LIMIT 1",
    )
  ).rows[0].detection_id;
  const result = await fixture.request(
    `/detections/${id}/feedback`,
    own("POST", {
      correct_detection: true,
      image_base64: `data:image/png;base64,${png}`,
    }),
  );
  assert.equal(result.status, 201);
  const stored = (
    await fixture.pool.query(
      "SELECT storage_path,content_sha256 FROM detection_feedback WHERE feedback_id=$1",
      [result.body.feedback_id],
    )
  ).rows[0];
  assert.match(stored.storage_path, /\/feedback\//);
  assert.equal(stored.content_sha256, digest(Buffer.from(png, "base64")));
  const feedback = await fixture.request(`/detections/${id}/feedback`, {
    token: owner.token,
  });
  assert.equal(feedback.status, 200);
  assert.match(feedback.body.image_path, /token=/);
  assert.equal((await fetch(feedback.body.image_path)).status, 200);
  assert.equal(
    (
      await fixture.request(`/detections/${id}/feedback`, {
        token: other.token,
      })
    ).status,
    404,
  );
});

test("farmer rejection cancels an alert still waiting in the outbox", async () => {
  await register(subscription("owner-reviewed-event"));
  await fixture.pool.query("UPDATE push_delivery SET status='CANCELLED'");
  const event = await ingest(payload());
  assert.equal(event.status, 201);
  const category = (
    await fixture.pool.query(
      "INSERT INTO feedback_category(category_name,description) VALUES ('Other','Test category') RETURNING category_id",
    )
  ).rows[0].category_id;
  assert.equal(
    (
      await fixture.request(
        `/detections/${event.body.detection_id}/feedback`,
        own("POST", { correct_detection: false, category_id: category }),
      )
    ).status,
    201,
  );
  let calls = 0;
  await createPushWorker(fixture.pool, config, {
    send: async () => {
      calls++;
    },
  }).tick();
  assert.equal(calls, 0);
  const jobs = (
    await fixture.pool.query(
      "SELECT status FROM push_delivery WHERE notification_id=$1",
      [event.body.notification_id],
    )
  ).rows;
  assert.ok(jobs.length);
  assert.ok(jobs.every((job) => job.status === "CANCELLED"));
  assert.equal(
    (
      await fixture.pool.query(
        "SELECT prediction FROM detection WHERE detection_id=$1",
        [event.body.detection_id],
      )
    ).rows[0].prediction,
    "DURIAN",
  );
});

test("invalid legacy device requests release their database transactions", async () => {
  for (const endpoint of ["/device/detections", "/fusion-event"]) {
    const response = await fixture.request(endpoint, {
      method: "POST",
      device: true,
      body: { node_id: node.node_id },
    });
    assert.equal(response.status, 400);
  }
  assert.equal(
    (
      await fixture.pool.query(
        "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'",
      )
    ).rows[0].n,
    0,
  );
});
