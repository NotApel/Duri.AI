import test from "node:test";
import assert from "node:assert/strict";
import {
  plotPayload,
  nodePayload,
  normalizePlots,
  normalizeNodes,
  normalizeNotifications,
} from "../src/services/farmData.js";
import {
  emptyFarm,
  updateFarm,
  validateFarm,
  farmStorageKey,
} from "../src/services/farmSimulation.js";
const id = (kind, n) =>
  `SIM-${kind}-00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const p1 = id("PLOT", 1),
  p2 = id("PLOT", 2),
  n1 = id("NODE", 1),
  e1 = id("EVENT", 1),
  note1 = id("NOTICE", 1);
const plot = {
  farm_name: " Test farm ",
  plot_name: " East ",
  plot_size: "2.5",
  latitude: "0",
  longitude: "101.5",
};
function savedPlot(state = emptyFarm(), plotId = p1) {
  return updateFarm(state, { type: "savePlot", id: plotId, draft: plot });
}
function savedNode(state = savedPlot()) {
  return updateFarm(state, {
    type: "saveNode",
    id: n1,
    draft: { plot_id: p1, node_name: " Node 1 ", firmware_version: "" },
  });
}
function candidate(state = savedNode()) {
  return updateFarm(state, {
    type: "candidate",
    id: n1,
    eventId: e1,
    notificationId: note1,
    now: "2026-10-23T09:00:00Z",
  });
}
test("plot creation needs no farmer-entered coordinates and validates names and size", () => {
  assert.deepEqual(plotPayload(plot), {
    farm_name: "Test farm",
    plot_name: "East",
    plot_size: 2.5,
  });
  for (const changed of [
    { plot_size: 0 },
    { plot_size: 1000000 },
    { plot_size: true },
    { farm_name: " " },
    { plot_name: "x".repeat(201) },
  ])
    assert.throws(() => plotPayload({ ...plot, ...changed }));
  assert.equal(
    nodePayload({ plot_id: p1, node_name: " Node ", firmware_version: "" })
      .firmware_version,
    null,
  );
  assert.throws(() => nodePayload({ plot_id: "", node_name: "Node" }));
});
test("plot selection and editing preserve the previous immutable state", () => {
  const original = savedPlot();
  const edited = updateFarm(original, {
    type: "savePlot",
    id: p1,
    draft: { ...plot, plot_name: "Updated" },
  });
  assert.equal(original.plots[0].plot_name, "East");
  assert.equal(edited.plots.length, 1);
  assert.equal(edited.plots[0].plot_name, "Updated");
  assert.equal(edited.selectedPlotId, p1);
  assert.throws(() => updateFarm(edited, { type: "selectPlot", id: p2 }));
});
test("registration requires an existing plot, rejects duplicate names, and starts with unavailable telemetry", () => {
  const state = savedNode();
  const node = state.nodes[0];
  assert.equal(node.node_name, "Node 1");
  assert.equal(node.status, "OFFLINE");
  assert.equal(node.battery_level, null);
  assert.equal(node.last_ping_at, null);
  assert.throws(() =>
    updateFarm(state, {
      type: "saveNode",
      id: id("NODE", 2),
      draft: { plot_id: p1, node_name: "node 1" },
    }),
  );
  assert.throws(() =>
    updateFarm(state, {
      type: "saveNode",
      id: id("NODE", 2),
      draft: { plot_id: p2, node_name: "Other" },
    }),
  );
  assert.equal(validateFarm(state), state);
});
test("assignment can change before events but cannot rewrite an event's plot history", () => {
  const state = savedPlot(savedNode(), p2);
  const assigned = updateFarm(state, {
    type: "saveNode",
    id: n1,
    draft: { ...state.nodes[0], plot_id: p2 },
  });
  assert.equal(assigned.nodes[0].plot_id, p2);
  const withEvent = candidate(state);
  assert.throws(
    () =>
      updateFarm(withEvent, {
        type: "saveNode",
        id: n1,
        draft: { ...withEvent.nodes[0], plot_id: p2 },
      }),
    /history/,
  );
  const renamed = updateFarm(withEvent, {
    type: "saveNode",
    id: n1,
    draft: { ...withEvent.nodes[0], node_name: "Renamed" },
  });
  assert.equal(renamed.events[0].node, "Node 1");
});
test("simulated connection changes never fabricate battery or confirm a candidate", () => {
  const state = candidate();
  const connected = updateFarm(state, {
    type: "connection",
    id: n1,
    status: "ONLINE",
    now: "2026-10-23T09:10:00Z",
  });
  assert.equal(connected.nodes[0].last_ping_at, "2026-10-23T09:10:00Z");
  assert.equal(connected.nodes[0].battery_level, null);
  const event = connected.events[0];
  assert.equal(event.status, "PENDING");
  for (const key of [
    "prediction",
    "confidence",
    "amplitude",
    "frequency",
    "duration",
  ])
    assert.equal(event[key], null);
  assert.equal(connected.notifications[0].is_read, false);
  assert.equal(connected.notifications[0].detection_id, event.id);
  const read = updateFarm(connected, { type: "markRead", id: note1 });
  assert.equal(read.notifications[0].is_read, true);
  assert.equal(connected.notifications[0].is_read, false);
});
test("saved simulation validation catches broken references, duplicate IDs and fabricated readings", () => {
  const valid = candidate();
  assert.deepEqual(validateFarm(JSON.parse(JSON.stringify(valid))), valid);
  for (const change of [
    { nodes: [] },
    { plots: [] },
    { events: [{ ...valid.events[0], amplitude: 1 }] },
    {
      notifications: [{ ...valid.notifications[0], detection_id: e1 + "bad" }],
    },
    { plots: [valid.plots[0], valid.plots[0]] },
    { selectedPlotId: p2 },
  ])
    assert.throws(() => validateFarm({ ...valid, ...change }));
  assert.notEqual(farmStorageKey("42"), farmStorageKey("84"));
});
test("backend normalization preserves BIGINT IDs and missing telemetry while rejecting wrong plot ownership", () => {
  const own = {
    plot_id: "9007199254740993",
    farmer_id: "42",
    farm_name: "Farm",
    plot_name: "East",
    latitude: "0",
    longitude: "0",
    plot_size: null,
  };
  const [normalized] = normalizePlots([own], "42");
  assert.equal(normalized.plot_id, own.plot_id);
  assert.equal(normalized.latitude, 0);
  assert.equal(normalized.plot_size, null);
  assert.throws(() => normalizePlots([own], "84"));
  assert.throws(() => normalizePlots([own, own], "42"));
  assert.throws(() => normalizePlots({ error: "failed" }, "42"));
  const [node] = normalizeNodes(
    [
      {
        node_id: 1,
        plot_id: "7",
        node_name: "Node",
        status: "unexpected",
        battery_level: true,
        last_ping_at: "bad",
      },
    ],
    "7",
  );
  assert.equal(node.status, "UNKNOWN");
  assert.equal(node.battery_level, null);
  assert.equal(node.last_ping_at, null);
  assert.throws(() =>
    normalizeNodes([{ node_id: 1, plot_id: "8", node_name: "Node" }], "7"),
  );
});
test("notification lists omit other farmers and preserve unread versus read without invented links", () => {
  const own = {
    notification_id: "1",
    farmer_id: "42",
    detection_id: "101",
    title: "Alert",
    is_read: false,
    created_at: "2026-10-23T09:00:00Z",
  };
  const rows = normalizeNotifications(
    [own, { ...own, notification_id: "2", farmer_id: "84" }],
    "42",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_read, false);
  assert.equal(rows[0].detection_id, "101");
  assert.equal(
    normalizeNotifications(
      [{ ...own, detection_id: "javascript:bad" }],
      "42",
    )[0].detection_id,
    null,
  );
  assert.throws(() =>
    normalizeNotifications([{ ...own, is_read: "false" }], "42"),
  );
});

test("deletion preserves simulation history and disabling never fabricates connectivity", () => {
  const empty = savedNode();
  assert.throws(
    () => updateFarm(empty, { type: "deletePlot", id: p1 }),
    /nodes/,
  );
  const removed = updateFarm(empty, { type: "deleteNode", id: n1 });
  assert.equal(
    updateFarm(removed, { type: "deletePlot", id: p1 }).plots.length,
    0,
  );
  assert.throws(
    () => updateFarm(candidate(), { type: "deleteNode", id: n1 }),
    /history/,
  );
  const disabled = updateFarm(candidate(), {
    type: "active",
    id: n1,
    is_active: false,
  });
  assert.equal(disabled.nodes[0].status, "OFFLINE");
  assert.equal(disabled.nodes[0].is_active, false);
  assert.throws(() => candidate(disabled));
  assert.equal(validateFarm(disabled), disabled);
});
