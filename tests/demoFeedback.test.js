import test from "node:test";
import assert from "node:assert/strict";
import { readFeedback, saveFeedback } from "../src/services/demoFeedback.js";
import { demoDetections } from "../src/data/demoDetections.js";
const storage = () => {
  let value = null;
  return {
    getItem: () => value,
    setItem: (_, next) => {
      value = next;
    },
  };
};
test("feedback persists across reads without changing system evidence", () => {
  const local = storage();
  const original = structuredClone(demoDetections);
  const next = saveFeedback(
    {},
    "SIM-104",
    "rejected",
    "Animal",
    "Saw an animal",
    local,
  );
  assert.deepEqual(readFeedback(local), next);
  assert.equal(next["SIM-104"].category, "Animal");
  assert.deepEqual(demoDetections, original);
  const revised = saveFeedback(next, "SIM-104", "unsure", "Animal", "", local);
  assert.equal(revised["SIM-104"].category, null);
  assert.equal(Object.keys(revised).length, 1);
});
test("invalid categories and real event IDs cannot be saved", () => {
  const local = storage();
  assert.throws(() => saveFeedback({}, "SIM-104", "rejected", "", "", local));
  assert.throws(() => saveFeedback({}, "REAL-104", "confirmed", "", "", local));
  assert.deepEqual(readFeedback(local), {});
});
test("corrupt or unavailable storage raises an error instead of reporting success", () => {
  assert.throws(() => readFeedback({ getItem: () => "{broken" }));
  assert.throws(() =>
    readFeedback({ getItem: () => '{"SIM-104":{"label":"invalid"}}' }),
  );
  assert.throws(() =>
    saveFeedback({}, "SIM-104", "confirmed", "", "", {
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    }),
  );
});
