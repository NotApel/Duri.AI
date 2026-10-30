import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source = await readFile(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
function worker() {
  const listeners = {},
    records = new Map(),
    shown = [],
    closed = [],
    opened = [],
    deleted = [],
    cacheWrites = [];
  const database = {
    createObjectStore() {},
    close() {},
    transaction() {
      const tx = {};
      tx.objectStore = () => ({
        get(key) {
          const request = {};
          queueMicrotask(() => {
            request.result = records.get(key);
            request.onsuccess?.();
            queueMicrotask(() => tx.oncomplete?.());
          });
          return request;
        },
        put(value, key) {
          const request = {};
          queueMicrotask(() => {
            records.set(key, value);
            request.onsuccess?.();
            queueMicrotask(() => tx.oncomplete?.());
          });
          return request;
        },
      });
      return tx;
    },
  };
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    },
  };
  const self = {
    location: { origin: "https://farm.example.invalid" },
    addEventListener(name, callback) {
      listeners[name] = callback;
    },
    registration: {
      async showNotification(title, options) {
        shown.push({ title, options });
      },
      async getNotifications() {
        return [
          {
            close() {
              closed.push(true);
            },
          },
        ];
      },
    },
    clients: {
      async claim() {},
      async matchAll() {
        return [];
      },
      async openWindow(url) {
        opened.push(url);
      },
    },
    skipWaiting() {},
  };
  const caches = {
    async keys() {
      return ["duriai-shell-previous", "some-other-app"];
    },
    async delete(name) {
      deleted.push(name);
    },
    async open() {
      return {
        async addAll(paths) {
          cacheWrites.push(...paths);
        },
      };
    },
    async match(path) {
      return path === "/index.html" ? new Response("PUBLIC SHELL") : undefined;
    },
  };
  vm.runInNewContext(source, {
    self,
    indexedDB,
    caches,
    URL,
    Response,
    fetch: async () => {
      throw new Error("offline");
    },
    console,
  });
  async function dispatch(name, properties = {}) {
    let work;
    listeners[name]({
      ...properties,
      waitUntil(promise) {
        work = promise;
      },
    });
    await work;
  }
  return {
    listeners,
    records,
    shown,
    closed,
    opened,
    deleted,
    cacheWrites,
    self,
    dispatch,
  };
}
test("push account changes persist only an account marker and close previous account notifications", async () => {
  const service = worker();
  const replies = [];
  await service.dispatch("message", {
    data: { type: "PUSH_ACCOUNT", farmerId: "42" },
    ports: [{ postMessage: (value) => replies.push(value) }],
  });
  assert.equal(service.records.get("farmerId"), "42");
  assert.equal(service.closed.length, 1);
  assert.equal(replies[0].ok, true);
  await service.dispatch("message", {
    data: { type: "PUSH_ACCOUNT", farmerId: null },
    ports: [],
  });
  assert.equal(service.records.get("farmerId"), null);
  assert.equal(service.records.size, 1);
});
test("push ignores malformed messages and other farmers; duplicate event tags remain stable", async () => {
  const service = worker();
  service.records.set("farmerId", "42");
  await service.dispatch("push", {
    data: {
      json() {
        throw new Error("bad JSON");
      },
    },
  });
  await service.dispatch("push", {
    data: { json: () => ({ farmer_id: "84", url: "/map/events/1" }) },
  });
  assert.equal(service.shown.length, 0);
  const value = {
    farmer_id: "42",
    title: "Confirmed harvest event",
    url: "/map/events/12",
  };
  await service.dispatch("push", { data: { json: () => value } });
  await service.dispatch("push", { data: { json: () => value } });
  assert.equal(service.shown.length, 2);
  assert.equal(service.shown[0].options.tag, "harvest-12");
  assert.equal(service.shown[0].options.renotify, false);
  assert.equal(service.shown[1].options.tag, service.shown[0].options.tag);
});
test("notification clicks cannot navigate off site and activation only removes owned caches", async () => {
  const service = worker();
  await service.dispatch("notificationclick", {
    notification: {
      close() {},
      data: { url: "https://attacker.example.invalid" },
    },
  });
  assert.equal(service.opened[0], "https://farm.example.invalid/notifications");
  await service.dispatch("notificationclick", {
    notification: { close() {}, data: { url: "/map/events/27" } },
  });
  assert.equal(service.opened[1], "https://farm.example.invalid/map/events/27");
  await service.dispatch("activate");
  assert.deepEqual(service.deleted, ["duriai-shell-previous"]);
});
test("service worker never intercepts private API/image requests; offline navigation uses only the public shell", async () => {
  const service = worker();
  for (const [url, method, mode] of [
    ["https://farm.example.invalid/api/auth/session", "GET", "cors"],
    ["https://farm.example.invalid/api/device/events", "POST", "cors"],
    ["https://storage.example.invalid/image?token=secret", "GET", "cors"],
    ["https://farm.example.invalid/private-image?token=secret", "GET", "cors"],
  ]) {
    let intercepted = false;
    service.listeners.fetch({
      request: { url, method, mode },
      respondWith() {
        intercepted = true;
      },
    });
    assert.equal(intercepted, false, url);
  }
  let response;
  service.listeners.fetch({
    request: {
      url: "https://farm.example.invalid/analytics",
      method: "GET",
      mode: "navigate",
    },
    respondWith(value) {
      response = value;
    },
  });
  assert.equal(await (await response).text(), "PUBLIC SHELL");
  assert.deepEqual(service.cacheWrites, []);
});
