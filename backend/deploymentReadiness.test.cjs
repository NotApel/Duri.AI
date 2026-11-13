const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { backendFixture } = require("../tests/helpers/backend.cjs");
const { provisionGateway, legacyDevicesEnabled } = require("./deviceAuth");
const { migrateAuth } = require("./auth");
const { deploymentProblems } = require("./deploymentConfig");
const { storageEmulator } = require("../tests/helpers/storage.cjs");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
let fixture, storage, owner, other, node, unassigned, otherNode, gateway;
before(async () => {
  storage = storageEmulator();
  const url = await storage.start();
  fixture = await backendFixture({
    LEGACY_DEVICE_ROUTES_ENABLED: "false",
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: storage.key,
  });
  owner = await fixture.account("deployment.owner");
  other = await fixture.account("deployment.other");
  async function createNode(farmer, name) {
    const options = (body) => ({ method: "POST", body, token: farmer.token });
    const plot = await fixture.request(
      `/farmers/${farmer.farmer_id}/plots`,
      options({ farm_name: "Test farm", plot_name: name, plot_size: 1 }),
    );
    return (
      await fixture.request(
        `/plots/${plot.body.plot_id}/nodes`,
        options({ node_name: name }),
      )
    ).body;
  }
  node = await createNode(owner, "Assigned");
  unassigned = await createNode(owner, "Unassigned");
  otherNode = await createNode(other, "Another farmer");
  gateway = await provisionGateway(fixture.pool, {
    farmerId: owner.farmer_id,
    name: "Test Pi",
    nodeIds: [node.node_id],
    isSimulation: true,
  });
});
after(async () => {
  await fixture?.close();
  await storage?.close();
});
const heartbeat = (id, token = gateway.credential, body = {}) =>
  fixture.request(`/device/nodes/${id}/heartbeat`, {
    method: "POST",
    token,
    body,
  });
function payload(id = randomUUID()) {
  const now = new Date().toISOString();
  return {
    source_event_id: id,
    node_id: node.node_id,
    occurred_at: now,
    decision: "CONFIRMED_HARVEST",
    vibration: { detected: true },
    camera: {
      prediction: "DURIAN",
      confidence: 95,
      model_version: "SIMULATION",
    },
    images: [
      {
        content_type: "image/png",
        data_base64: readFileSync(
          require("node:path").join(__dirname, "../tests/fixtures/capture.png"),
        ).toString("base64"),
        captured_at: now,
      },
    ],
  };
}
test("production disables legacy writes; development compatibility is explicit and malformed switches fail", async () => {
  assert.equal(legacyDevicesEnabled({ NODE_ENV: "production" }), false);
  assert.equal(legacyDevicesEnabled({ NODE_ENV: "development" }), true);
  assert.equal(
    legacyDevicesEnabled({
      NODE_ENV: "production",
      LEGACY_DEVICE_ROUTES_ENABLED: "true",
    }),
    true,
  );
  assert.throws(() =>
    legacyDevicesEnabled({ LEGACY_DEVICE_ROUTES_ENABLED: "yes" }),
  );
  for (const endpoint of [
    "/sensor-readings",
    "/device/detections",
    "/fusion-event",
  ])
    assert.equal(
      (
        await fixture.request(endpoint, {
          method: "POST",
          device: true,
          body: { node_id: node.node_id },
        })
      ).status,
      410,
    );
});
test("farmer detection-write aliases cannot bypass gateway validation or write prediction records", async () => {
  const reading = (
    await fixture.pool.query(
      "INSERT INTO sensor_reading(node_id,amplitude,frequency) VALUES ($1,0,0) RETURNING reading_id",
      [node.node_id],
    )
  ).rows[0];
  const before = (
    await fixture.pool.query("SELECT count(*) AS n FROM detection")
  ).rows[0].n;
  for (const endpoint of ["/detection", "/detections"]) {
    assert.equal(
      (await fixture.request(endpoint, { method: "POST", body: {} })).status,
      401,
    );
    for (const status of ["VERIFIED", "PENDING", "REJECTED"]) {
      const response = await fixture.request(endpoint, {
        method: "POST",
        token: owner.token,
        body: {
          reading_id: reading.reading_id,
          prediction: "DURIAN",
          confidence: 1,
          verify_required: false,
          detection_status: status,
        },
      });
      assert.equal(response.status, 410);
      assert.match(response.body.error, /\/api\/device\/events/);
    }
  }
  assert.equal(
    (await fixture.pool.query("SELECT count(*) AS n FROM detection")).rows[0].n,
    before,
  );
  assert.equal(
    (await fixture.request("/detections", { token: owner.token })).status,
    200,
  );
});
test("gateway heartbeats are scoped to assigned nodes and never fall back from Bearer to shared credentials", async () => {
  assert.equal((await heartbeat(node.node_id, owner.token)).status, 401);
  assert.equal((await heartbeat(unassigned.node_id)).status, 404);
  assert.equal((await heartbeat(otherNode.node_id)).status, 404);
  assert.equal(
    (await heartbeat(node.node_id, gateway.credential, { latitude: 0 })).status,
    400,
  );
  const result = await heartbeat(node.node_id);
  assert.equal(result.status, 200);
  assert.equal(result.body.status, "ONLINE");
  assert.equal(result.body.latitude, null);
  assert.equal(result.body.battery_level, null);
  assert.equal(result.body.battery_recorded_at, null);
  assert.equal(result.body.simulation, true);
  assert.equal(
    (
      await heartbeat(node.node_id, gateway.credential, {
        latitude: 0,
        longitude: 101,
        battery_level: 0,
      })
    ).status,
    200,
  );
  const hidden = (await fixture.request("/nodes", { token: other.token })).body;
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].node_id, otherNode.node_id);
  await fixture.pool.query(
    "UPDATE device_gateway SET is_active=FALSE WHERE gateway_id=$1",
    [gateway.gateway_id],
  );
  assert.equal((await heartbeat(node.node_id)).status, 401);
  await fixture.pool.query(
    "UPDATE device_gateway SET is_active=TRUE WHERE gateway_id=$1",
    [gateway.gateway_id],
  );
  await fixture.pool.query(
    "UPDATE sensor_node SET is_active=FALSE WHERE node_id=$1",
    [node.node_id],
  );
  assert.equal((await heartbeat(node.node_id)).status, 404);
  await fixture.pool.query(
    "UPDATE sensor_node SET is_active=TRUE,status='OFFLINE',last_ping_at=NULL,latitude=NULL,longitude=NULL,battery_level=NULL,battery_recorded_at=NULL WHERE node_id=$1",
    [node.node_id],
  );
});
test("connectivity preserves battery measurements and their times; zero and explicit clearing remain supported", async () => {
  try {
    // An upgraded record may have a measurement with no known recording time.
    await fixture.pool.query(
      "UPDATE sensor_node SET battery_level=62,battery_recorded_at=NULL WHERE node_id=$1",
      [node.node_id],
    );
    await migrateAuth(fixture.pool);
    await migrateAuth(fixture.pool);
    const legacy = await heartbeat(node.node_id);
    assert.equal(legacy.body.battery_level, 62);
    assert.equal(legacy.body.battery_recorded_at, null);
    const measured = await heartbeat(node.node_id, gateway.credential, {
      battery_level: 75,
    });
    assert.equal(measured.status, 200);
    assert.equal(measured.body.battery_level, 75);
    assert.ok(Number.isFinite(Date.parse(measured.body.battery_recorded_at)));
    await fixture.pool.query(
      "UPDATE sensor_node SET last_ping_at=NOW()-INTERVAL '10 minutes' WHERE node_id=$1",
      [node.node_id],
    );
    const ping = await heartbeat(node.node_id);
    assert.equal(ping.body.status, "ONLINE");
    assert.equal(ping.body.battery_level, 75);
    assert.equal(
      ping.body.battery_recorded_at,
      measured.body.battery_recorded_at,
    );
    for (const invalid of [-1, 101, 0.5, ""]) {
      assert.equal(
        (
          await heartbeat(node.node_id, gateway.credential, {
            battery_level: invalid,
          })
        ).status,
        400,
      );
    }
    const unchanged = await heartbeat(node.node_id);
    assert.equal(unchanged.body.battery_level, 75);
    assert.equal(
      unchanged.body.battery_recorded_at,
      measured.body.battery_recorded_at,
    );
    const cleared = await heartbeat(node.node_id, gateway.credential, {
      battery_level: null,
    });
    assert.equal(cleared.body.battery_level, null);
    assert.equal(cleared.body.battery_recorded_at, null);
    const zero = await heartbeat(node.node_id, gateway.credential, {
      battery_level: 0,
    });
    assert.equal(zero.body.battery_level, 0);
    assert.ok(zero.body.battery_recorded_at);
    const last = await heartbeat(node.node_id);
    assert.equal(last.body.battery_level, 0);
    assert.equal(last.body.battery_recorded_at, zero.body.battery_recorded_at);
  } finally {
    await fixture.pool.query(
      "UPDATE sensor_node SET battery_level=NULL,battery_recorded_at=NULL WHERE node_id=$1",
      [node.node_id],
    );
  }
});
test("different concurrent events serialize safely, refresh connectivity and retain unavailable telemetry", async () => {
  const bodies = [payload(), payload()];
  const results = await Promise.all(
    bodies.map((body) =>
      fixture.request("/device/events", {
        method: "POST",
        token: gateway.credential,
        body,
      }),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.status),
    [201, 201],
  );
  const saved = (
    await fixture.pool.query("SELECT * FROM sensor_node WHERE node_id=$1", [
      node.node_id,
    ])
  ).rows[0];
  assert.equal(saved.status, "ONLINE");
  assert.ok(saved.last_ping_at);
  assert.equal(saved.battery_level, null);
  assert.equal(saved.latitude, null);
  const retry = await fixture.request("/device/events", {
    method: "POST",
    token: gateway.credential,
    body: bodies[0],
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.detection_id, results[0].body.detection_id);
});
test("reference categories are usable immediately and repeat migrations preserve custom case, IDs and descriptions", async () => {
  const before = (await fixture.request("/feedback-categories")).body;
  assert.deepEqual(before.map((c) => c.category_name).sort(), [
    "Animal",
    "Other",
    "Rain",
    "Wind",
  ]);
  await fixture.pool.query(
    "UPDATE feedback_category SET category_name='WIND',description='Operator description' WHERE category_name='Wind'",
  );
  await migrateAuth(fixture.pool);
  await migrateAuth(fixture.pool);
  const after = (await fixture.request("/feedback-categories")).body;
  assert.deepEqual(
    after.map((c) => c.category_id),
    before.map((c) => c.category_id),
  );
  assert.equal(
    after.find((c) => c.category_name === "WIND").description,
    "Operator description",
  );
  const event = await fixture.request("/device/events", {
    method: "POST",
    token: gateway.credential,
    body: payload(),
  });
  const feedback = await fixture.request(
    `/detections/${event.body.detection_id}/feedback`,
    {
      method: "POST",
      token: owner.token,
      body: {
        correct_detection: false,
        category_id: before.find((c) => c.category_name === "Animal")
          .category_id,
      },
    },
  );
  assert.equal(feedback.status, 201);
});
test("full deployment preflight reports missing setup without printing provided secret values", () => {
  const secret = "private-placeholder-that-must-not-appear";
  const problems = deploymentProblems({
    NODE_ENV: "production",
    JWT_SECRET: secret,
    DB_SSL: "false",
    LEGACY_DEVICE_ROUTES_ENABLED: "true",
  });
  assert.ok(problems.length >= 5);
  assert.ok(!JSON.stringify(problems).includes(secret));
  const keys = require("web-push").generateVAPIDKeys();
  assert.deepEqual(
    deploymentProblems({
      NODE_ENV: "production",
      JWT_SECRET: "a".repeat(64),
      DATABASE_URL:
        "postgresql://operator:password@db.example.invalid/postgres",
      DB_SSL: "true",
      FRONTEND_URL: "https://farm.example.invalid",
      FRONTEND_ORIGINS: "https://farm.example.invalid",
      SUPABASE_URL: "https://storage.example.invalid",
      SUPABASE_SERVICE_ROLE_KEY: "test-storage-key",
      PUSH_ENABLED: "true",
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:operator@example.invalid",
      SMTP_HOST: "mail.example.invalid",
      SMTP_FROM: "operator@example.invalid",
    }),
    [],
  );
});
test("demo seeding refuses production even when the destructive development opt-in is supplied", () => {
  const result = require("node:child_process").spawnSync(
    process.execPath,
    ["seed.js"],
    {
      cwd: __dirname,
      encoding: "utf8",
      timeout: 5000,
      env: {
        ...process.env,
        NODE_ENV: "production",
        ALLOW_DESTRUCTIVE_SEED: "true",
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Seed refused/);
});
test("the Pi SQLite sender delivers its durable event through the real API and private Storage flow", async () => {
  const { Outbox } = require("../pi/outbox.cjs");
  const { configuration, client, deliverOne } = require("../pi/client.cjs");
  const { mkdtempSync, rmSync } = require("node:fs");
  const dir = mkdtempSync(
    require("node:path").join(require("node:os").tmpdir(), "pi-api-"),
  );
  const config = configuration({
    PI_API_URL: fixture.base.replace(/\/api$/, ""),
    PI_ALLOW_LOCAL_HTTP: "true",
    PI_GATEWAY_CREDENTIAL: gateway.credential,
    PI_SIMULATION: "true",
    PI_OUTBOX_PATH: `${dir}/events.sqlite`,
  });
  const box = new Outbox(config.outboxPath, config.identity);
  try {
    const event = payload();
    box.enqueue(event);
    await deliverOne(box, client(config));
    assert.equal(box.status()[0].status, "SENT");
    assert.equal(
      (
        await fixture.pool.query(
          "SELECT count(*)::int AS n FROM gateway_event WHERE source_event_id=$1",
          [event.source_event_id],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    box.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
