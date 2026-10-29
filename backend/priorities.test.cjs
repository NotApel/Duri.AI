const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { backendFixture } = require("../tests/helpers/backend.cjs");
let fixture, owner, other, plotA, plotB, node, events;
const request = (...args) => fixture.request(...args);
const own = (method, body) => ({ method, body, token: owner.token });
before(async () => {
  fixture = await backendFixture();
  owner = await fixture.account("owner");
  other = await fixture.account("other");
  const createPlot = (name) =>
    request(
      `/farmers/${owner.farmer_id}/plots`,
      own("POST", { farm_name: "Test farm", plot_name: name, plot_size: 2.5 }),
    );
  plotA = (await createPlot("East")).body;
  plotB = (await createPlot("West")).body;
  assert.ok(plotA.plot_id);
  assert.equal(plotA.latitude, null);
  node = (
    await request(
      `/plots/${plotA.plot_id}/nodes`,
      own("POST", { node_name: "Test node" }),
    )
  ).body;
});
after(async () => {
  if (fixture) await fixture.close();
});
test("farm migration is repeatable, coordinates are optional and farmers cannot manage other plots", async () => {
  const { migrateAuth } = require("./auth");
  await migrateAuth(fixture.pool);
  assert.equal(
    (await request(`/plots/${plotA.plot_id}/nodes`, { token: other.token }))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/farmers/${other.farmer_id}/plots`,
        own("POST", { farm_name: "bad", plot_name: "bad", plot_size: 1 }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/farmers/${owner.farmer_id}/plots`,
        own("POST", { farm_name: 5, plot_name: "bad", plot_size: 1 }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/plots/${plotA.plot_id}`,
        own("PATCH", {
          farm_name: "Changed",
          plot_name: "East edited",
          plot_size: 3,
        }),
      )
    ).status,
    200,
  );
});
test("registration, listing and reassignment work without fabricated telemetry or locations", async () => {
  const list = await request(`/plots/${plotA.plot_id}/nodes`, {
    token: owner.token,
  });
  assert.equal(list.body[0].status, "OFFLINE");
  assert.equal(list.body[0].latitude, null);
  assert.equal(list.body[0].battery_level, null);
  assert.equal(
    (
      await request(
        `/nodes/${node.node_id}`,
        own("PATCH", { node_name: "Renamed", plot_id: plotB.plot_id }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/plots/${plotA.plot_id}/nodes`, { token: owner.token }))
      .body.length,
    0,
  );
  assert.equal(
    (
      await request(
        `/nodes/${node.node_id}`,
        own("PATCH", { node_name: "Renamed", plot_id: plotA.plot_id }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/plots/${plotA.plot_id}/nodes`,
        own("POST", { node_name: "Renamed" }),
      )
    ).status,
    409,
  );
});
test("only device heartbeats supply locations; disabled nodes cannot report and stale nodes are offline", async () => {
  const endpoint = `/device/nodes/${node.node_id}/heartbeat`;
  assert.equal(
    (await request(endpoint, own("POST", { latitude: 0, longitude: 101 })))
      .status,
    401,
  );
  assert.equal(
    (
      await request(endpoint, {
        method: "POST",
        device: true,
        body: { latitude: 0 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(endpoint, {
        method: "POST",
        device: true,
        body: { latitude: 91, longitude: 101 },
      })
    ).status,
    400,
  );
  const heartbeat = await request(endpoint, {
    method: "POST",
    device: true,
    body: { latitude: 0, longitude: 101, battery_level: 70 },
  });
  assert.equal(heartbeat.status, 200);
  assert.equal(heartbeat.body.status, "ONLINE");
  assert.equal(Number(heartbeat.body.latitude), 0);
  assert.equal(
    (await request("/nodes", { token: other.token })).body.length,
    0,
  );
  assert.equal(
    (
      await request(
        `/nodes/${node.node_id}`,
        own("PATCH", { node_name: "Renamed", is_active: false }),
      )
    ).body.status,
    "OFFLINE",
  );
  assert.equal(
    (await request(endpoint, { method: "POST", device: true, body: {} }))
      .status,
    404,
  );
  await request(
    `/nodes/${node.node_id}`,
    own("PATCH", { node_name: "Renamed", is_active: true }),
  );
  await fixture.pool.query(
    "UPDATE sensor_node SET last_ping_at=NOW()-INTERVAL '1 hour'",
  );
  assert.equal(
    (await request("/nodes", { token: owner.token })).body[0].status,
    "OFFLINE",
  );
});
test("keyset pagination reaches all older events including microsecond timestamps, filters and direct lookup", async () => {
  const reading = (
    await fixture.pool.query(
      "INSERT INTO sensor_reading(node_id,amplitude,frequency,duration) VALUES ($1,0,18,0.8) RETURNING reading_id",
      [node.node_id],
    )
  ).rows[0];
  events = (
    await fixture.pool.query(
      `INSERT INTO detection(reading_id,prediction,confidence,detection_status,detection_at)
    SELECT $1,CASE WHEN i%2=0 THEN 'DURIAN' ELSE 'NOT_DURIAN' END,80,'REJECTED',TIMESTAMPTZ '2026-10-23 12:00:00Z'+i*INTERVAL '1 microsecond'
    FROM generate_series(1,45) i RETURNING detection_id`,
      [reading.reading_id],
    )
  ).rows;
  let cursor,
    ids = [];
  do {
    const result = await request(
      `/detections?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { token: owner.token },
    );
    assert.equal(result.status, 200);
    ids.push(...result.body.items.map((row) => row.detection_id));
    cursor = result.body.next_cursor;
  } while (cursor);
  assert.equal(ids.length, 45);
  assert.equal(new Set(ids).size, 45);
  const filtered = await request("/detections?limit=100&prediction=DURIAN", {
    token: owner.token,
  });
  assert.equal(filtered.body.items.length, 22);
  assert.ok(filtered.body.items.every((row) => row.prediction === "DURIAN"));
  const event = await request(`/detections/${events[0].detection_id}`, {
    token: owner.token,
  });
  assert.equal(event.status, 200);
  assert.equal(Number(event.body.amplitude), 0);
  assert.equal(Number(event.body.node_latitude), 0);
  for (const endpoint of [
    "/detections?limit=20",
    `/detections/${events[0].detection_id}`,
    `/detections/${events[0].detection_id}/images`,
  ]) {
    const foreign = await request(endpoint, { token: other.token });
    assert.equal(foreign.status, endpoint.includes("?") ? 200 : 404);
    if (foreign.status === 200) assert.equal(foreign.body.items.length, 0);
  }
  for (const query of [
    "limit=0",
    "limit=101",
    "cursor=bad",
    "prediction=unknown",
    "limit=1.1",
  ])
    assert.equal(
      (await request(`/detections?${query}`, { token: owner.token })).status,
      400,
    );
});
test("feedback requires a category only for No Durian, allows blank comments and preserves model prediction", async () => {
  const category = (
    await fixture.pool.query(
      "INSERT INTO feedback_category(category_name,description) VALUES ('Animal','Animal caused the event') RETURNING category_id",
    )
  ).rows[0].category_id;
  const endpoint = (id) => `/detections/${events[id].detection_id}/feedback`;
  assert.equal(
    (await request(endpoint(0), own("POST", { correct_detection: false })))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        endpoint(0),
        own("POST", { correct_detection: "false", category_id: category }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        endpoint(0),
        own("POST", { correct_detection: true, category_id: "999999" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        endpoint(0),
        own("POST", { correct_detection: true, farmer_id: other.farmer_id }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(endpoint(0), {
        method: "POST",
        token: other.token,
        body: { correct_detection: true },
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(endpoint(0), own("POST", { correct_detection: true })))
      .status,
    201,
  );
  assert.equal(
    (
      await request(
        endpoint(1),
        own("POST", {
          correct_detection: false,
          category_id: category,
          comment_farmer: "",
        }),
      )
    ).status,
    201,
  );
  const direct = (
    await request(`/detections/${events[0].detection_id}`, {
      token: owner.token,
    })
  ).body;
  assert.equal(direct.prediction, "NOT_DURIAN");
  assert.equal(direct.detection_status, "VERIFIED");
  assert.equal(direct.farmer_feedback.category_id, null);
  const savedFeedback = await request(
    `/detections/${events[0].detection_id}/feedback`,
    { token: owner.token },
  );
  assert.equal(savedFeedback.status, 200);
  assert.equal(savedFeedback.body.correct_detection, true);
  assert.equal(savedFeedback.body.farmer_id, owner.farmer_id);
  assert.equal(
    (
      await request(`/detections/${events[0].detection_id}/feedback`, {
        token: other.token,
      })
    ).status,
    404,
  );
  const concurrent = await Promise.all([
    request(endpoint(2), own("POST", { correct_detection: true })),
    request(endpoint(2), own("POST", { correct_detection: true })),
  ]);
  assert.deepEqual(concurrent.map((row) => row.status).sort(), [201, 409]);
  assert.equal(
    (await fixture.pool.query("SELECT count(*)::int AS n FROM training_queue"))
      .rows[0].n,
    3,
  );
});
test("deletion and reassignment protect history, failed operations release all transactions", async () => {
  assert.equal(
    (
      await request(
        `/nodes/${node.node_id}`,
        own("PATCH", { node_name: "Renamed", plot_id: plotB.plot_id }),
      )
    ).status,
    409,
  );
  assert.equal(
    (await request(`/nodes/${node.node_id}`, own("DELETE"))).status,
    409,
  );
  assert.equal(
    (await request(`/plots/${plotA.plot_id}`, own("DELETE"))).status,
    409,
  );
  assert.equal(
    (
      await request(`/plots/${plotA.plot_id}`, {
        method: "DELETE",
        token: other.token,
      })
    ).status,
    404,
  );
  assert.equal(
    (await request(`/plots/${plotB.plot_id}`, own("DELETE"))).status,
    200,
  );
  const fresh = (
    await request(
      `/plots/${plotA.plot_id}/nodes`,
      own("POST", { node_name: "Unused" }),
    )
  ).body;
  assert.equal(
    (await request(`/nodes/${fresh.node_id}`, own("DELETE"))).status,
    200,
  );
  const open = await fixture.pool.query(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'",
  );
  assert.equal(open.rows[0].n, 0);
});
test("training metrics are truthful, farmer-scoped and unconfigured training cannot run", async () => {
  const data = await request("/analytics/training", { token: owner.token });
  assert.equal(data.status, 200);
  assert.equal(data.body.totalCorrections, 3);
  assert.equal(data.body.pendingTraining, 3);
  assert.equal(data.body.currentAccuracy, null);
  assert.deepEqual(data.body.evaluations, []);
  assert.deepEqual(data.body.accuracyHistory, []);
  assert.equal(data.body.retraining_available, false);
  assert.equal(
    (await request("/analytics/training", { token: other.token })).body
      .totalCorrections,
    0,
  );
  assert.equal(
    (await request("/analytics/retrain", own("POST", {}))).status,
    503,
  );
  assert.equal(
    (
      await fixture.pool.query(
        "SELECT count(*)::int AS n FROM training_queue WHERE queue_status='PENDING'",
      )
    ).rows[0].n,
    3,
  );
});

test("configured worker reports script completion without inventing evaluation or consuming the feedback queue", async () => {
  const { mkdtemp, writeFile, rm } = require("node:fs/promises");
  const { tmpdir } = require("node:os");
  const path = require("node:path");
  const folder = await mkdtemp(path.join(tmpdir(), "duri worker test "));
  const script = path.join(folder, "worker script.cjs");
  let workerFixture;
  try {
    await writeFile(script, "setTimeout(() => process.exit(0), 500);");
    workerFixture = await backendFixture({
      PYTHON_PATH: process.execPath,
      RETRAIN_SCRIPT_PATH: script,
    });
    const farmer = await workerFixture.account("worker.farmer");
    const token = farmer.token;
    const workerPlot = (
      await workerFixture.request(`/farmers/${farmer.farmer_id}/plots`, {
        method: "POST",
        token: farmer.token,
        body: {
          farm_name: "Worker farm",
          plot_name: "Worker plot",
          plot_size: 1,
        },
      })
    ).body;
    const workerNode = (
      await workerFixture.request(`/plots/${workerPlot.plot_id}/nodes`, {
        method: "POST",
        token: farmer.token,
        body: { node_name: "Worker node" },
      })
    ).body;
    const workerReading = (
      await workerFixture.pool.query(
        "INSERT INTO sensor_reading(node_id,amplitude,frequency) VALUES ($1,0,0) RETURNING reading_id",
        [workerNode.node_id],
      )
    ).rows[0];
    const workerEvent = (
      await workerFixture.pool.query(
        "INSERT INTO detection(reading_id,prediction,confidence) VALUES ($1,'DURIAN',80) RETURNING detection_id",
        [workerReading.reading_id],
      )
    ).rows[0];
    assert.equal(
      (
        await workerFixture.request(
          `/detections/${workerEvent.detection_id}/feedback`,
          {
            method: "POST",
            token: farmer.token,
            body: { correct_detection: true },
          },
        )
      ).status,
      201,
    );
    const request = (endpoint, options = {}) =>
      workerFixture.request(endpoint, { token, ...options });
    assert.equal(
      (await request("/analytics/training")).body.retraining_available,
      true,
    );
    assert.equal(
      (await request("/analytics/retrain", { method: "POST", body: {} }))
        .status,
      202,
    );
    assert.equal(
      (await request("/analytics/retrain", { method: "POST", body: {} }))
        .status,
      409,
    );
    async function finished() {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const state = (await request("/analytics/retrain-status")).body;
        if (state.status !== "processing") return state;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      throw new Error("Worker did not finish.");
    }
    assert.equal((await finished()).status, "success");
    const result = (await request("/analytics/training")).body;
    assert.equal(result.currentAccuracy, null);
    assert.deepEqual(result.evaluations, []);
    assert.equal(result.pendingTraining, 1);
    await writeFile(script, "process.exit(1);");
    assert.equal(
      (await request("/analytics/retrain", { method: "POST", body: {} }))
        .status,
      202,
    );
    assert.equal((await finished()).status, "failed");
  } finally {
    if (workerFixture) await workerFixture.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test("dashboard counts and training queue cannot expose another farmer’s records", async () => {
  assert.equal(
    (await request("/analytics/stats", { token: owner.token })).body.total,
    45,
  );
  assert.equal(
    (await request("/analytics/stats", { token: other.token })).body.total,
    0,
  );
  assert.equal(
    (await request("/training-queue", { token: other.token })).body.length,
    0,
  );
  assert.equal(
    (await request("/training-queue", { token: owner.token })).body.length,
    3,
  );
});

test("disabled nodes cannot submit readings, detections or fusion events", async () => {
  await request(
    `/nodes/${node.node_id}`,
    own("PATCH", { node_name: "Renamed", is_active: false }),
  );
  try {
    for (const endpoint of [
      "/sensor-readings",
      "/device/detections",
      "/fusion-event",
    ])
      assert.equal(
        (
          await request(endpoint, {
            method: "POST",
            device: true,
            body: {
              node_id: node.node_id,
              amplitude: 1,
              frequency: 20,
              duration: 1,
              prediction: "DURIAN",
              confidence: 95,
            },
          })
        ).status,
        404,
      );
  } finally {
    await request(
      `/nodes/${node.node_id}`,
      own("PATCH", { node_name: "Renamed", is_active: true }),
    );
  }
});
