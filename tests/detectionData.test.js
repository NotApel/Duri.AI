import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDetections,
  measurement,
  detectionType,
  normalizeCategories,
  feedbackPayload,
  csvCell,
} from "../src/services/detectionData.js";
import { normalizeImages, imageUrl } from "../src/services/detectionImages.js";
import {
  readReceipts,
  writeReceipts,
} from "../src/services/feedbackReceipts.js";
const row = {
  detection_id: "9007199254740993",
  detection_at: "2026-10-23T16:30:00Z",
  detection_status: "PENDING",
  prediction: "DURIAN",
};
test("database IDs retain precision and absent evidence never becomes fabricated measurements", () => {
  const [event] = normalizeDetections([row]);
  assert.equal(event.id, row.detection_id);
  assert.equal(event.node, "Unavailable");
  for (const name of [
    "confidence",
    "amplitude",
    "frequency",
    "duration",
    "amplitudeUnit",
  ])
    assert.equal(event[name], null);
  assert.equal(detectionType(event), "Durian");
  assert.equal(
    detectionType(
      normalizeDetections([
        { ...row, prediction: "unexpected", detection_status: "VERIFIED" },
      ])[0],
    ),
    "Unknown",
  );
  assert.equal(
    normalizeDetections([{ ...row, detection_status: "unexpected" }])[0].status,
    "UNKNOWN",
  );
});
test("measurements accept zero and numeric database strings, rejecting malformed or impossible values", () => {
  assert.equal(measurement("0"), 0);
  for (const value of [true, [], {}, " ", "Infinity", -1])
    assert.equal(measurement(value), null);
  const [event] = normalizeDetections([
    {
      ...row,
      amplitude: "0",
      amplitude_unit: "g",
      confidence: "101",
      frequency: "18.5",
      duration: "0.8",
    },
  ]);
  assert.equal(event.amplitude, 0);
  assert.equal(event.amplitudeUnit, "g");
  assert.equal(event.frequency, 18.5);
  assert.equal(event.confidence, null);
});
test("invalid lists, duplicate IDs and bad timestamps surface errors instead of invented empty results", () => {
  for (const value of [
    { error: "failed" },
    [null],
    [row, row],
    [{ ...row, detection_at: null }],
    [{ ...row, detection_id: "SIM-104" }],
  ])
    assert.throws(() => normalizeDetections(value));
  assert.deepEqual(normalizeDetections([]), []);
});
test("category IDs come from the server and the legacy boolean follows farmer classification, not model agreement", () => {
  assert.deepEqual(
    normalizeCategories([{ category_id: 27, category_name: "Other" }]),
    [{ id: "27", name: "Other" }],
  );
  assert.throws(() =>
    normalizeCategories([{ category_id: 1, category_name: "" }]),
  );
  const input = {
    farmerId: 42,
    categoryId: 27,
    label: "NOT_DURIAN",
    comment: "  Animal beside the tree.  ",
  };
  const payload = feedbackPayload(input);
  assert.deepEqual(payload, {
    farmer_id: "42",
    category_id: "27",
    correct_detection: false,
    comment_farmer: "Animal beside the tree.",
  });
  assert.equal(
    feedbackPayload({ ...input, label: "DURIAN" }).correct_detection,
    true,
  );
  assert.deepEqual(
    feedbackPayload({
      ...input,
      label: "DURIAN",
      categoryId: "",
      comment: " ",
    }),
    {
      farmer_id: "42",
      category_id: null,
      correct_detection: true,
      comment_farmer: null,
    },
  );
  assert.equal(feedbackPayload({ ...input, comment: "" }).comment_farmer, null);
  for (const changed of [
    { farmerId: null },
    { categoryId: "" },
    { label: "unsure" },
    { comment: "x".repeat(501) },
  ])
    assert.throws(() => feedbackPayload({ ...input, ...changed }));
});
test("CSV escapes quoted values and neutralizes formulas in backend node names", () => {
  assert.equal(csvCell('North "A"'), '"North ""A"""');
  for (const value of ["=1+1", " +SUM(A1)", "@test", "\tvalue", "-1+2"])
    assert.equal(csvCell(value).startsWith("\"'"), true);
});
test("image records use sequence_number and API-host URLs without allowing executable or credentialed URLs", () => {
  const base = "https://api.example.invalid/api";
  const rows = normalizeImages(
    [
      { image_id: 2, image_path: "/two.jpg", sequence_number: 2 },
      { image_id: 1, image_path: "/one.jpg", sequence_number: 1 },
    ],
    base,
  );
  assert.equal(rows[0].url, "https://api.example.invalid/one.jpg");
  for (const path of [
    "javascript:alert(1)",
    "data:image/svg+xml,test",
    "file:///tmp/file",
    "https://name:password@example.invalid/image.jpg",
    null,
  ])
    assert.equal(imageUrl(path, base), null);
  assert.throws(() => normalizeImages({ error: "failed" }, base));
});
test("feedback receipts are account-scoped and storage failures do not masquerade as backend submission failures", () => {
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
  const receipt = {
    label: "NOT_DURIAN",
    categoryId: "27",
    category: "Other",
    comment: "Animal",
    savedAt: "2026-10-23T17:00:00Z",
    eventTime: row.detection_at,
    feedbackId: "10",
  };
  assert.equal(
    writeReceipts("42", { [row.detection_id]: receipt }, storage),
    true,
  );
  assert.deepEqual(readReceipts("42", storage), {
    [row.detection_id]: receipt,
  });
  assert.deepEqual(readReceipts("43", storage), {});
  assert.deepEqual(readReceipts("42", { getItem: () => "{broken" }), {});
  assert.equal(
    writeReceipts(
      "42",
      {},
      {
        setItem: () => {
          throw new Error("Quota");
        },
      },
    ),
    false,
  );
});

test("node location accepts equator coordinates and rejects incomplete or invented locations", () => {
  const [located] = normalizeDetections([
    {
      ...row,
      node_latitude: "0",
      node_longitude: "101.5",
      location_recorded_at: row.detection_at,
    },
  ]);
  assert.deepEqual(located.location, [0, 101.5]);
  for (const [lat, lon] of [
    [null, 1],
    [1, null],
    [91, 10],
    [0, 181],
    [true, 1],
    ["", 1],
  ])
    assert.equal(
      normalizeDetections([
        { ...row, node_latitude: lat, node_longitude: lon },
      ])[0].location,
      null,
    );
});
test("server feedback without an optional category or comment remains an accepted assessment", () => {
  const [event] = normalizeDetections([
    {
      ...row,
      farmer_feedback: {
        feedback_id: "10",
        correct_detection: true,
        category_id: null,
        comment_farmer: null,
        feedback_at: row.detection_at,
      },
    },
  ]);
  assert.equal(event.feedback.label, "DURIAN");
  assert.equal(event.feedback.categoryId, null);
  const storage = {
    getItem: () => JSON.stringify({ [event.id]: event.feedback }),
  };
  assert.deepEqual(readReceipts("42", storage)[event.id], event.feedback);
});
