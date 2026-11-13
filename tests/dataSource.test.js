import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultDataSource } from "../src/services/dataSource.js";
test("production uses backend records while development retains an explicit simulation workspace", () => {
  assert.equal(defaultDataSource(true), "backend");
  assert.equal(defaultDataSource(false), "simulation");
});
