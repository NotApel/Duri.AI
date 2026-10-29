// Requires Playwright and Chromium as test tools, plus a local PostgreSQL server.
// Creates and drops its own database; never uses DB_NAME or an existing orchard.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { readFile } = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { chromium } = require("playwright");
const { Pool } = require("../backend/node_modules/pg");
const root = path.resolve(__dirname, "..");
const database = `duri_detection_test_${process.pid}_${Date.now()}`;
const connection = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
};
const admin = new Pool({ ...connection, database: "postgres" });
const pool = new Pool({ ...connection, database });
const children = [];
let browser;
async function port() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
function start(script, args, cwd, env) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return () => output;
}
async function ready(url, output) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Server is starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start: ${output()}`);
}
async function main() {
  await admin.query(`CREATE DATABASE ${database}`);
  for (const table of [
    "farmer",
    "farmplot",
    "sensornode",
    "sensorreading",
    "detection",
    "detectionimage",
    "feedbackcategory",
    "detectionfeedback",
    "notification",
    "trainingqueue",
  ])
    await pool.query(
      await readFile(path.join(root, "database", `${table}.sql`), "utf8"),
    );
  const apiPort = await port(),
    webPort = await port();
  const base = `http://127.0.0.1:${webPort}`;
  const api = `http://127.0.0.1:${apiPort}/api`;
  const backendOutput = start("app.js", [], path.join(root, "backend"), {
    DB_HOST: connection.host,
    DB_PORT: String(connection.port),
    DB_USER: connection.user,
    DB_PASSWORD: connection.password,
    DB_NAME: database,
    PORT: String(apiPort),
    JWT_SECRET: "disposable-browser-test-secret-never-for-deployment",
    DEVICE_API_KEY: "disposable-browser-device-key",
    FRONTEND_ORIGINS: base,
  });
  await ready(`${api}/health`, backendOutput);
  const frontendOutput = start(
    "node_modules/vite/bin/vite.js",
    ["--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    root,
    { VITE_API_URL: api },
  );
  await ready(base, frontendOutput);
  const password = "test-password-2026";
  const registration = await fetch(`${api}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: "Detection test farmer",
      username: "detection.test",
      email: "detection@example.invalid",
      phone_number: "+60123456789",
      password,
    }),
  });
  assert.equal(registration.status, 201);
  const { farmer } = await registration.json();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().startsWith(api))
      requests.push({
        url: request.url(),
        method: request.method(),
        authorization: request.headers().authorization,
      });
  });
  await page.goto(`${base}/login`);
  await page.getByLabel("Username", { exact: true }).fill("detection.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/dashboard");
  const token = await page.evaluate(() => localStorage.getItem("token"));
  assert.ok(token);
  await page.goto(`${base}/analytics`);
  await page
    .getByText("No backend detections are available yet.", { exact: true })
    .waitFor();
  const plot = (
    await pool.query(
      "INSERT INTO farm_plot (farmer_id,farm_name,plot_name,latitude,longitude) VALUES ($1,'TEST ONLY','TEST ONLY',0,0) RETURNING plot_id",
      [farmer.farmer_id],
    )
  ).rows[0];
  const node = (
    await pool.query(
      "INSERT INTO sensor_node (plot_id,node_name) VALUES ($1,'=1+1') RETURNING node_id",
      [plot.plot_id],
    )
  ).rows[0];
  const reading = (
    await pool.query(
      "INSERT INTO sensor_reading (node_id,amplitude,frequency) VALUES ($1,0,0) RETURNING reading_id",
      [node.node_id],
    )
  ).rows[0];
  const events = (
    await pool.query(
      "INSERT INTO detection (reading_id,prediction,confidence,detection_at) VALUES ($1,'DURIAN',87,'2026-10-20T18:05:00Z'),($1,'NOT_DURIAN',63,'2026-10-20T17:00:00Z') RETURNING detection_id",
      [reading.reading_id],
    )
  ).rows;
  const first = events[0].detection_id,
    second = events[1].detection_id;
  await pool.query(
    "INSERT INTO feedback_category (category_id,category_name,description) OVERRIDING SYSTEM VALUE VALUES (27,'Other','Test category'),(31,'Animal','Test category')",
  );
  await pool.query(
    "INSERT INTO detection_image (detection_id,image_path,sequence_number) VALUES ($1,'/test-only/missing.png',2),($1,'/test-only/first.svg',1)",
    [second],
  );
  await page.getByRole("button", { name: "Refresh logs", exact: true }).click();
  await page
    .getByRole("link", { name: `View event ${first} on`, exact: false })
    .waitFor();
  assert.deepEqual(await page.locator("thead th").allTextContents(), [
    "Date",
    "Time (MYT)",
    "Detection type",
    "Node",
  ]);
  assert.match(await page.locator("tbody").innerText(), /21 Oct 2026/);
  assert.match(await page.locator("tbody").innerText(), /02:05 am/i);
  await page.getByLabel("Detection type").selectOption("Durian");
  await page.locator("tbody tr").first().waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  const csvEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const csv = await csvEvent;
  const csvText = await readFile(await csv.path(), "utf8");
  assert.match(csvText, /"Date","Time \(MYT\)","Detection type","Node"/);
  assert.match(csvText, /"'=1\+1"/);
  assert.doesNotMatch(csvText, /Not durian/);
  const pdfEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  assert.equal(
    (await readFile(await (await pdfEvent).path())).subarray(0, 4).toString(),
    "%PDF",
  );
  await page
    .getByRole("link", { name: `View event ${first} on`, exact: false })
    .click();
  await page.getByText("Camera image unavailable.", { exact: false }).waitFor();
  assert.deepEqual(
    await page.locator(".d-measurements strong").allTextContents(),
    ["0", "0 Hz", "Unavailable"],
  );
  await page.getByLabel("Feedback category").selectOption("31");
  await page.getByRole("radio", { name: "No Durian", exact: true }).check();
  await page.getByLabel("Detailed comments").fill("Saw an animal, no fruit.");
  // Retain the merged branch's optional upload and reject invalid files before POST.
  const upload = page.getByLabel("Upload feedback image (optional)");
  for (const file of [
    {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    },
    {
      name: "oversized.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    },
  ]) {
    await upload.setInputFiles(file);
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Choose a JPEG or PNG image no larger than 5 MB." })
      .waitFor();
    assert.equal(
      (await pool.query("SELECT count(*) FROM detection_feedback")).rows[0]
        .count,
      "0",
    );
  }
  await upload.setInputFiles([]);
  await context.setOffline(true);
  await page.waitForFunction(() => document.querySelector("fieldset").disabled);
  await context.setOffline(false);
  await page.waitForFunction(
    () => !document.querySelector("fieldset").disabled,
  );
  assert.equal(
    await page.evaluate(async (api) => (await fetch(`${api}/health`)).ok, api),
    true,
  );
  // A failed POST keeps the editable form and never claims success.
  await page.route("**/api/detections/*/feedback", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Test-only feedback outage" },
    }),
  );
  await page
    .getByRole("button", { name: "Submit feedback", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Test-only feedback outage" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Detailed comments").inputValue(),
    "Saw an animal, no fruit.",
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM detection_feedback")).rows[0].count,
    "0",
  );
  await page.unroute("**/api/detections/*/feedback");
  // Submit the form twice in the same browser task, exercising the pending guard.
  await page.locator(".d-feedback form").evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await page
    .getByText("Feedback accepted by the server.", { exact: true })
    .waitFor();
  const feedback = (await pool.query("SELECT * FROM detection_feedback")).rows;
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].farmer_id, farmer.farmer_id);
  assert.equal(feedback[0].category_id, "31");
  assert.equal(feedback[0].correct_detection, false);
  assert.equal(feedback[0].comment_farmer, "Saw an animal, no fruit.");
  assert.deepEqual(
    (
      await pool.query(
        "SELECT prediction,detection_status FROM detection WHERE detection_id=$1",
        [first],
      )
    ).rows[0],
    { prediction: "DURIAN", detection_status: "REJECTED" },
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM training_queue")).rows[0].count,
    "1",
  );
  await page.reload();
  await page
    .getByText("Feedback accepted by the server.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("link", { name: "Back to orchard map", exact: true })
    .click();
  await page.locator(".d-event").waitFor();
  assert.equal(await page.locator(".d-event").count(), 1);
  await page.locator(".d-event").click();
  await page
    .getByRole("option", { name: "Other", exact: true })
    .waitFor({ state: "attached" });
  // Only image bytes are stubbed; metadata comes from the actual database/API.
  await page.route("**/test-only/first.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#37583a"/></svg>',
    }),
  );
  await page.getByRole("button", { name: "Retry image", exact: true }).click();
  await page.locator(".d-image-viewer figure img").waitFor();
  assert.match(
    await page.locator(".d-image-viewer figure img").getAttribute("src"),
    /first.svg$/,
  );
  await page
    .getByRole("button", { name: "Enlarge image", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Image 2", exact: true }).click();
  await page
    .getByText("This image could not be loaded.", { exact: false })
    .waitFor();
  // No Durian needs an available category; Durian remains available without one.
  await page.route("**/api/feedback-categories", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Test-only category outage" },
    }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Retry categories", exact: true })
    .waitFor();
  await page.getByRole("radio", { name: "No Durian", exact: true }).check();
  assert.equal(
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("radio", { name: "Durian", exact: true }).check();
  assert.equal(
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .isDisabled(),
    false,
  );
  await page.unroute("**/api/feedback-categories");
  await page.route("**/api/feedback-categories", (route) =>
    route.fulfill({ json: [] }),
  );
  await page
    .getByRole("button", { name: "Retry categories", exact: true })
    .click();
  await page
    .getByText("No categories are configured.", { exact: false })
    .waitFor();
  await page.unroute("**/api/feedback-categories");
  await page.reload();
  await page
    .getByRole("option", { name: "Other", exact: true })
    .waitFor({ state: "attached" });
  // Server acceptance must remain success even if receipt storage is blocked.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("duriai.api-feedback"))
        throw new Error("Test-only storage failure");
      return original.call(this, key, value);
    };
  });
  await page.getByLabel("Feedback category").selectOption("27");
  await page.getByRole("radio", { name: "Durian", exact: true }).check();
  await page
    .getByLabel("Detailed comments")
    .fill("Fruit found under the tree.");
  await page
    .getByRole("button", { name: "Submit feedback", exact: true })
    .click();
  await page
    .getByText("Feedback accepted by the server.", { exact: true })
    .waitFor();
  await page
    .getByText("Your feedback was accepted, but this browser", { exact: false })
    .waitFor();
  assert.equal(
    (
      await pool.query(
        "SELECT correct_detection FROM detection_feedback WHERE detection_id=$1",
        [second],
      )
    ).rows[0].correct_detection,
    true,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT prediction FROM detection WHERE detection_id=$1",
        [second],
      )
    ).rows[0].prediction,
    "NOT_DURIAN",
  );
  await page
    .getByRole("link", { name: "View Harvest Logs", exact: false })
    .click();
  await page
    .getByRole("link", { name: `View event ${first} on`, exact: false })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 2);
  // Network and malformed data failures keep prior records explicitly stale.
  await page.route("**/api/detections?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Test-only detections outage" },
    }),
  );
  await page.getByRole("button", { name: "Refresh logs", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Displayed records may be stale" })
    .waitFor();
  await page
    .getByRole("link", { name: `View event ${first} on`, exact: false })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 2);
  assert.equal(
    await page
      .getByRole("button", { name: "Export CSV", exact: true })
      .isDisabled(),
    true,
  );
  await page.unroute("**/api/detections?*");
  await page.route("**/api/detections?*", (route) =>
    route.fulfill({ json: { invalid: "not a list" } }),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "invalid detection history" })
    .waitFor();
  await page.unroute("**/api/detections?*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/map", "/analytics", `/map/events/${first}`]) {
      await page.goto(`${base}${route}`);
      await page.getByText("Backend records", { exact: true }).waitFor();
      await page
        .getByText("Loading backend detections…", { exact: true })
        .waitFor({ state: "hidden" });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `Overflow at ${width}: ${route}`,
      );
      await page.screenshot({
        path: `/tmp/duri-detection-${width}-${route.replaceAll("/", "_")}.png`,
        fullPage: true,
      });
    }
  }
  // A malformed stored receipt cannot blank the logs, and empty API data is authoritative.
  await page.evaluate(
    (id) => sessionStorage.setItem(`duriai.api-feedback.v1.${id}`, "{broken"),
    farmer.farmer_id,
  );
  await page.goto(`${base}/analytics`);
  await page
    .getByRole("link", { name: `View event ${first} on`, exact: false })
    .waitFor();
  await page.route("**/api/detections?*", (route) =>
    route.fulfill({ json: { items: [], next_cursor: null } }),
  );
  await page.getByRole("button", { name: "Refresh logs", exact: true }).click();
  await page
    .getByText("No backend detections are available yet.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 0);
  await page.unroute("**/api/detections?*");
  assert.ok(
    requests.some(
      (request) =>
        request.url.startsWith(`${api}/detections?`) &&
        request.authorization === `Bearer ${token}`,
    ),
  );
  assert.ok(
    requests.some(
      (request) =>
        request.method === "POST" &&
        request.url.endsWith("/feedback") &&
        request.authorization === `Bearer ${token}`,
    ),
  );
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Log out", exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL((url) => ["/", "/login"].includes(url.pathname));
  assert.equal(
    (
      await fetch(`${api}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
    401,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS actual JWT login/logout, shared backend events, MYT/4-column logs, safe CSV/PDF, authenticated feedback/queue DB writes, double-submit guard, preserved predictions, receipts, failure/retry/offline/storage states, image ordering/viewer, authoritative empty results and 320/390/1440 layouts.",
  );
}
main()
  .finally(async () => {
    if (browser) await browser.close();
    await Promise.all(
      children.map(async (child) => {
        if (child.exitCode !== null) return;
        const stopped = once(child, "exit");
        child.kill();
        await stopped;
      }),
    );
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.end();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
