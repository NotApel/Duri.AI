// Real API/PostgreSQL, local Storage emulator, built PWA and real service worker.
// Browser subscription is simulated; no external push provider is contacted.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { readFile, writeFile, mkdir, rm } = require("node:fs/promises");
const { randomUUID, randomBytes, createECDH } = require("node:crypto");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  backendFixture,
  freePort,
  waitReady,
} = require("./helpers/backend.cjs");
const { storageEmulator } = require("./helpers/storage.cjs");
const { provisionGateway } = require("../backend/deviceAuth");
const webPush = require("../backend/node_modules/web-push");
async function main() {
  const storage = storageEmulator();
  const storageUrl = await storage.start();
  const keys = webPush.generateVAPIDKeys(),
    webPort = await freePort(),
    base = `http://127.0.0.1:${webPort}`;
  const useWrangler = process.env.PWA_SERVER === "wrangler";
  const outputDir = `/tmp/duri-cloud-pwa-${process.pid}`;
  const runtimeDir = `${outputDir}-runtime`;
  let fixture, browser, frontend;
  try {
    fixture = await backendFixture({
      FRONTEND_ORIGINS: base,
      SUPABASE_URL: storageUrl,
      SUPABASE_SERVICE_ROLE_KEY: storage.key,
      PUSH_ENABLED: "true",
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "mailto:test@example.invalid",
    });
    const farmer = await fixture.account("pwa.farmer");
    const own = (method, body) => ({ method, body, token: farmer.token });
    const plot = (
      await fixture.request(
        `/farmers/${farmer.farmer_id}/plots`,
        own("POST", {
          farm_name: "Test orchard",
          plot_name: "Test plot",
          plot_size: 1,
        }),
      )
    ).body;
    const node = (
      await fixture.request(
        `/plots/${plot.plot_id}/nodes`,
        own("POST", { node_name: "Test capture node" }),
      )
    ).body;
    const gateway = await provisionGateway(fixture.pool, {
      farmerId: farmer.farmer_id,
      name: "Browser simulation",
      nodeIds: [node.node_id],
      isSimulation: true,
    });
    const image = (
      await readFile(path.join(__dirname, "fixtures/capture.png"))
    ).toString("base64");
    const event = {
      source_event_id: randomUUID(),
      node_id: node.node_id,
      occurred_at: new Date().toISOString(),
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
          data_base64: image,
          captured_at: new Date().toISOString(),
        },
      ],
    };
    const ingested = await fixture.request("/device/events", {
      method: "POST",
      token: gateway.credential,
      body: event,
    });
    assert.equal(ingested.status, 201);
    const id = ingested.body.detection_id;
    const build = spawn(
      process.execPath,
      ["node_modules/vite/bin/vite.js", "build", "--outDir", outputDir],
      {
        cwd: fixture.root,
        env: {
          ...process.env,
          WORKERS_CI: "",
          VERCEL: "",
          VITE_API_URL: fixture.base,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    build.stdout.on("data", (data) => (logs += data));
    build.stderr.on("data", (data) => (logs += data));
    const [code] = await once(build, "exit");
    assert.equal(code, 0, logs);
    let serverArgs;
    if (useWrangler) {
      const config = JSON.parse(
        await readFile(path.join(fixture.root, "wrangler.jsonc"), "utf8"),
      );
      // Keep the tested asset policy, but isolate output/state from the repository.
      const settings = { ...config };
      delete settings.env;
      await mkdir(runtimeDir, { recursive: true });
      const configPath = path.join(runtimeDir, "wrangler.test.json");
      await writeFile(
        configPath,
        JSON.stringify({
          ...settings,
          assets: { ...settings.assets, directory: outputDir },
        }),
      );
      serverArgs = [
        "node_modules/wrangler/bin/wrangler.js",
        "dev",
        "--local",
        "--ip",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--config",
        configPath,
        "--persist-to",
        path.join(runtimeDir, "state"),
      ];
    } else {
      serverArgs = [
        "node_modules/vite/bin/vite.js",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
        "--outDir",
        outputDir,
      ];
    }
    frontend = spawn(process.execPath, serverArgs, {
      cwd: fixture.root,
      env: {
        ...process.env,
        VITE_API_URL: fixture.base,
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_LOG_PATH: path.join(runtimeDir, "logs"),
        XDG_CONFIG_HOME: path.join(runtimeDir, "config"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    frontend.stdout.on("data", (data) => (logs += data));
    frontend.stderr.on("data", (data) => (logs += data));
    await waitReady(base, () => logs);
    // The API is cross-origin even in the real browser workflow.
    const preflight = await fetch(`${fixture.base}/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: base,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), base);
    assert.equal(
      preflight.headers.get("access-control-allow-credentials"),
      "true",
    );
    const denied = await fetch(`${fixture.base}/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://unlisted.example.invalid",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    if (useWrangler) {
      const worker = await fetch(`${base}/sw.js`);
      assert.match(worker.headers.get("content-type"), /javascript/);
      assert.match(worker.headers.get("cache-control"), /no-store/);
      assert.equal(worker.headers.get("service-worker-allowed"), "/");
      const script = await worker.text();
      assert.ok(
        !script.includes("__BUILD__") && !script.includes("__DURI_PRECACHE__"),
      );
      const precache = JSON.parse(
        script.match(/const PRECACHE\s*=\s*(\[[\s\S]*?\]);/)[1],
      );
      for (const assetPath of precache) {
        const response = await fetch(`${base}${assetPath}`);
        assert.equal(
          response.status,
          200,
          `Missing precached asset: ${assetPath}`,
        );
        const type = response.headers.get("content-type");
        if (assetPath.endsWith(".js")) assert.match(type, /javascript/);
        if (assetPath.endsWith(".css")) assert.match(type, /text\/css/);
        if (assetPath.endsWith(".png")) assert.match(type, /image\/png/);
      }
      const manifest = await fetch(`${base}/manifest.webmanifest`);
      assert.match(manifest.headers.get("content-type"), /json|manifest/);
      assert.match(manifest.headers.get("cache-control"), /no-cache/);
      for (const icon of (await manifest.json()).icons) {
        const response = await fetch(`${base}${icon.src}`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /image\/png/);
      }
      const entry = (
        await readFile(path.join(outputDir, "index.html"), "utf8")
      ).match(/src="([^"]+\.js)"/)[1];
      const asset = await fetch(`${base}${entry}`);
      assert.match(asset.headers.get("content-type"), /javascript/);
      assert.match(asset.headers.get("cache-control"), /immutable/);
      for (const route of [
        "/login",
        "/register",
        "/dashboard",
        "/map",
        `/map/events/${id}`,
        "/analytics",
        "/settings",
        "/reset-password",
      ]) {
        const response = await fetch(`${base}${route}`, {
          headers: { "Sec-Fetch-Mode": "navigate" },
        });
        assert.equal(response.status, 200);
        assert.match(await response.text(), /id="root"/);
      }
    }

    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 900 },
    });
    await context.grantPermissions(["notifications"], { origin: base });
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    await context.addInitScript(
      ({ p256dh, auth }) => {
        Object.defineProperty(Notification, "permission", {
          configurable: true,
          get: () => localStorage.getItem("test-permission") || "default",
        });
        Notification.requestPermission = async () => {
          localStorage.setItem(
            "test-permission-calls",
            String(
              Number(localStorage.getItem("test-permission-calls") || 0) + 1,
            ),
          );
          localStorage.setItem("test-permission", "granted");
          return "granted";
        };
        function wrapped(raw) {
          return raw
            ? {
                endpoint: raw.endpoint,
                options: {
                  applicationServerKey: new Uint8Array(raw.applicationServerKey)
                    .buffer,
                },
                toJSON: () => ({ endpoint: raw.endpoint, keys: raw.keys }),
                async unsubscribe() {
                  localStorage.removeItem("test-subscription");
                  return true;
                },
              }
            : null;
        }
        PushManager.prototype.getSubscription = async () =>
          wrapped(
            JSON.parse(localStorage.getItem("test-subscription") || "null"),
          );
        PushManager.prototype.subscribe = async (options) => {
          const raw = {
            endpoint: `https://fcm.googleapis.com/fcm/send/test-${crypto.randomUUID()}`,
            applicationServerKey: Array.from(
              new Uint8Array(options.applicationServerKey),
            ),
            keys: { p256dh, auth },
          };
          localStorage.setItem("test-subscription", JSON.stringify(raw));
          return wrapped(raw);
        };
      },
      {
        p256dh: ecdh.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    const cdp = await context.newCDPSession(page);
    let registrationId;
    cdp.on("ServiceWorker.workerRegistrationUpdated", (event) => {
      const registration = event.registrations.find(
        (value) => value.scopeURL === `${base}/` && !value.isDeleted,
      );
      if (registration) registrationId = registration.registrationId;
    });
    await cdp.send("ServiceWorker.enable");
    await page.goto(`${base}/map/events/${id}`);
    await page.waitForURL("**/login");
    await page.getByLabel("Username", { exact: true }).fill(farmer.username);
    await page.getByLabel("Password", { exact: true }).fill(farmer.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL(`**/map/events/${id}`);
    await page
      .getByText("Simulated Raspberry Pi event", { exact: false })
      .waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector(".d-image-viewer figure img")?.naturalWidth > 0,
    );
    assert.equal(
      await page
        .locator(".d-image-viewer figure img")
        .evaluate((img) => img.naturalWidth),
      32,
    );
    // A failed signed image can fetch fresh metadata rather than reusing an expired URL.
    await page
      .locator(".d-image-viewer figure img")
      .evaluate((img) => img.dispatchEvent(new Event("error")));
    await page
      .getByRole("button", { name: "Retry image", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector(".d-image-viewer figure img")?.naturalWidth > 0,
    );
    await page.goto(`${base}/settings`);
    await page
      .getByText("Harvest alerts are disabled for this account and browser.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("test-permission-calls")),
      null,
    );
    await page
      .getByRole("button", { name: "Enable harvest alerts", exact: true })
      .click();
    await page
      .getByText("Harvest alerts are enabled for this account and browser.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("test-permission-calls")),
      "1",
    );
    assert.equal(
      (
        await fixture.pool.query(
          "SELECT count(*)::int n FROM push_subscription WHERE farmer_id=$1",
          [farmer.farmer_id],
        )
      ).rows[0].n,
      1,
    );
    const manifest = await page.evaluate(
      async () => await (await fetch("/manifest.webmanifest")).json(),
    );
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.theme_color, "#37583a");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    const deadline = Date.now() + 10000;
    while (!registrationId && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(
      registrationId,
      "Service worker registration should be inspectable.",
    );
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: base,
      registrationId,
      data: JSON.stringify({
        farmer_id: farmer.farmer_id,
        title: "Simulated harvest event",
        url: `/map/events/${id}`,
      }),
    });
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.ready;
      return (await registration.getNotifications()).length === 1;
    });
    assert.equal(
      await page.evaluate(
        async () =>
          (await (await navigator.serviceWorker.ready).getNotifications())[0]
            .tag,
      ),
      `harvest-${id}`,
    );
    await page.reload();
    await page
      .getByText("Harvest alerts are enabled for this account and browser.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("test-permission-calls")),
      "1",
    );
    await page
      .getByRole("button", { name: "Disable harvest alerts", exact: true })
      .click();
    await page
      .getByText("Harvest alerts are disabled for this account and browser.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      (
        await fixture.pool.query(
          "SELECT count(*)::int n FROM push_subscription WHERE farmer_id=$1",
          [farmer.farmer_id],
        )
      ).rows[0].n,
      0,
    );
    await page.evaluate(() =>
      localStorage.setItem("test-permission", "denied"),
    );
    await page
      .getByRole("button", {
        name: "Refresh notification settings",
        exact: true,
      })
      .click();
    await page
      .getByText("Notifications are blocked.", { exact: false })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Enable harvest alerts", exact: true })
        .isDisabled(),
      true,
    );
    await page.evaluate(() =>
      localStorage.setItem("test-permission", "granted"),
    );
    await page
      .getByRole("button", {
        name: "Refresh notification settings",
        exact: true,
      })
      .click();
    await page
      .getByText("Harvest alerts are disabled for this account and browser.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Enable harvest alerts", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Disable harvest alerts", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Log out", exact: true })
      .filter({ visible: true })
      .click();
    await page.waitForURL((url) => ["/", "/login"].includes(url.pathname));
    assert.equal(
      (
        await fixture.pool.query(
          "SELECT count(*)::int n FROM push_subscription WHERE farmer_id=$1",
          [farmer.farmer_id],
        )
      ).rows[0].n,
      0,
    );
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: base,
      registrationId,
      data: JSON.stringify({
        farmer_id: farmer.farmer_id,
        url: `/map/events/${id}`,
      }),
    });
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.ready;
      return (await registration.getNotifications()).length === 0;
    });
    const cached = await page.evaluate(async () => {
      const all = [];
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys())
          all.push(request.url);
      return all;
    });
    assert.ok(cached.some((url) => url.endsWith("/index.html")));
    assert.ok(cached.some((url) => url.includes("/assets/")));
    assert.ok(
      cached.every((url) => !url.includes("/api/") && !url.includes("token=")),
    );
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("heading", { name: "Login", exact: true }).waitFor();
    await context.setOffline(false);
    await page.getByLabel("Username", { exact: true }).fill(farmer.username);
    await page.getByLabel("Password", { exact: true }).fill(farmer.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`${base}/settings`);
    await page
      .getByText("Harvest alerts are disabled for this account and browser.", {
        exact: true,
      })
      .waitFor();
    await page.route("**/api/push/public-key", (route) =>
      route.fulfill({ json: { enabled: false, public_key: null } }),
    );
    await page
      .getByRole("button", {
        name: "Refresh notification settings",
        exact: true,
      })
      .click();
    await page
      .getByText("Push notifications are not configured on the backend.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Enable harvest alerts", exact: true })
        .isDisabled(),
      true,
    );
    await page.unroute("**/api/push/public-key");
    await page.evaluate(() => {
      window.__testPushManager = window.PushManager;
      Reflect.deleteProperty(window, "PushManager");
    });
    await page
      .getByRole("button", {
        name: "Refresh notification settings",
        exact: true,
      })
      .click();
    await page
      .getByText("This browser cannot receive push notifications here.", {
        exact: false,
      })
      .waitFor();
    await page.evaluate(() => {
      window.PushManager = window.__testPushManager;
    });
    await page
      .getByRole("button", {
        name: "Refresh notification settings",
        exact: true,
      })
      .click();
    await page
      .getByText("Harvest alerts are disabled for this account and browser.", {
        exact: true,
      })
      .waitFor();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page
        .getByRole("heading", { name: "Settings", exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `Settings overflow at ${width}`,
      );
      await page.screenshot({
        path: `/tmp/duri-cloud-settings-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${useWrangler ? "Wrangler Static Assets" : "Vite preview"}: built PWA installation assets, real Storage image rendering/refresh, authenticated event deep link, consent-only push enable/disable, farmer/session subscription ownership, synthetic service-worker push, logout suppression, public-only offline shell and 320/390/1440 Settings. Browser subscription/provider delivery were simulated.`,
    );
  } catch (error) {
    if (browser)
      for (const context of browser.contexts())
        for (const page of context.pages()) {
          console.error(
            "Failed page:",
            page.url(),
            (await page.locator("body").innerText()).slice(0, 1800),
          );
          await page.screenshot({
            path: "/tmp/duri-cloud-failure.png",
            fullPage: true,
          });
        }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (frontend && frontend.exitCode === null) {
      const exited = once(frontend, "exit");
      frontend.kill("SIGTERM");
      await exited;
    }
    if (fixture) await fixture.close();
    await storage.close();
    await rm(outputDir, { recursive: true, force: true });
    await rm(runtimeDir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
