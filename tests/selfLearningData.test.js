import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDetections,
  detectionType,
} from "../src/services/detectionData.js";
import { normalizeTraining } from "../src/services/trainingData.js";
const row = {
  detection_id: 7,
  detection_at: "2026-10-21T03:00:00Z",
  detection_status: "PENDING",
};
test("missing backend measurements and predictions never become invented evidence", () => {
  const [event] = normalizeDetections([row]);
  assert.equal(event.id, "7");
  assert.equal(event.node, "Unavailable");
  for (const key of [
    "amplitude",
    "frequency",
    "duration",
    "confidence",
    "prediction",
  ])
    assert.equal(event[key], null);
  assert.equal(detectionType(event), "Awaiting verification");
});
test("numeric database measurements are normalized without replacing zero values", () => {
  const [event] = normalizeDetections([
    {
      ...row,
      node_name: "Backend node",
      prediction: "NOT_DURIAN",
      amplitude: "0",
      frequency: "18",
      duration: "0.4",
      confidence: "87.5",
    },
  ]);
  assert.equal(event.amplitude, 0);
  assert.equal(event.frequency, 18);
  assert.equal(event.confidence, 87.5);
  assert.equal(detectionType(event), "Not durian");
});
test("invalid detection responses surface an error instead of a fabricated empty result", () => {
  assert.throws(() => normalizeDetections({ error: "database unavailable" }));
  assert.throws(() =>
    normalizeDetections([{ ...row, detection_at: "broken" }]),
  );
});
test("hardcoded legacy metrics do not appear as evaluated training results", () => {
  const stats = normalizeTraining({
    totalCorrections: 2,
    pendingTraining: 0,
    farmerPoints: 20,
    currentAccuracy: 99.93,
    lastRetrained: "2026-10-18 10:30 AM",
    accuracyHistory: [{ week: "Week 3", accuracy: 99.93 }],
  });
  assert.equal(stats.totalCorrections, 2);
  assert.equal(stats.pendingTraining, 0);
  assert.equal(stats.accuracy, null);
  assert.equal(stats.lastEvaluated, null);
  assert.deepEqual(stats.evaluations, []);
});
test("evaluation history requires model, timestamp, sample count and bounded numeric accuracy", () => {
  const valid = {
    model_version: "v2",
    evaluated_at: "2026-10-21T03:00:00Z",
    sample_count: 100,
    accuracy: 92,
  };
  const stats = normalizeTraining({
    evaluations: [
      valid,
      { ...valid, accuracy: 150 },
      { ...valid, sample_count: 0 },
      { accuracy: 99 },
    ],
  });
  assert.deepEqual(stats.evaluations, [valid]);
  assert.equal(stats.accuracy, 92);
  assert.throws(() => normalizeTraining(null));
});
