/* Build replaces the empty precache with this release's public application assets. */
const CACHE_NAME = "duriai-shell-__BUILD__";
const PRECACHE = /*__DURI_PRECACHE__*/ [];
const allowedPath = (value) =>
  typeof value === "string" && /^\/map\/events\/[1-9]\d*$/.test(value)
    ? value
    : "/notifications";
function accountStore(value, write = false) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("duriai-push-context", 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore("context");
    opening.onerror = () =>
      reject(new Error("Notification account storage unavailable."));
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction(
        "context",
        write ? "readwrite" : "readonly",
      );
      const store = transaction.objectStore("context");
      const request = write
        ? store.put(value, "farmerId")
        : store.get("farmerId");
      let result;
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        reject(new Error("Notification account storage unavailable."));
      };
      transaction.onabort = transaction.onerror;
    };
  });
}
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("duriai-shell-") && name !== CACHE_NAME)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type !== "PUSH_ACCOUNT") return;
  const id = event.data.farmerId;
  if (!(id === null || (typeof id === "string" && /^[1-9]\d*$/.test(id))))
    return;
  event.waitUntil(
    (async () => {
      const previous = await accountStore(null);
      await accountStore(id, true);
      if (previous !== id || id === null)
        for (const notification of await self.registration.getNotifications())
          notification.close();
      event.ports[0]?.postMessage({ ok: true });
    })().catch(() => event.ports[0]?.postMessage({ ok: false })),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  // Never cache API responses, signed URLs, POSTs or cross-origin images.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match("/index.html")) ||
          new Response("Duri.AI needs a connection for this page.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    );
  } else if (!url.search && PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(url.pathname).then((cached) => cached || fetch(request)),
    );
  }
});
self.addEventListener("push", (event) =>
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data?.json();
      } catch {
        return;
      }
      if (!data || String(data.farmer_id) !== (await accountStore(null)))
        return;
      const path = allowedPath(data.url);
      const eventId = /^\/map\/events\/([1-9]\d*)$/.exec(path)?.[1];
      await self.registration.showNotification(
        typeof data.title === "string"
          ? data.title.slice(0, 100)
          : "Duri.AI harvest alert",
        {
          body: "Open Duri.AI to review the harvest event.",
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-96.png",
          tag: eventId ? `harvest-${eventId}` : "duriai-alert",
          renotify: false,
          data: { url: path },
        },
      );
    })(),
  ),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const path = allowedPath(event.notification.data?.url),
        target = new URL(path, self.location.origin).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const window of windows) {
        if (
          new URL(window.url).origin === self.location.origin &&
          "focus" in window
        ) {
          if ("navigate" in window) await window.navigate(target);
          await window.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
