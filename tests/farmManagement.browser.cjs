// Frontend contracts only: API responses are intercepted, no real device or DB is used.
// Run with Playwright available as an external test tool through NODE_PATH.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const path = require("node:path");
const { chromium } = require("playwright");
let browser, child;
async function main() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const base = `http://127.0.0.1:${port}`,
    api = `${base}/api`;
  child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, VITE_API_URL: api },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  const deadline = Date.now() + 15000;
  let started = false;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(base)).ok) {
        started = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(started, logs);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let farmerId = "42",
    writes = false,
    listFailure = false,
    nodeFailure = false;
  const plots = [
    {
      plot_id: "7",
      farmer_id: "42",
      farm_name: "Backend farm",
      plot_name: "Backend East",
      plot_size: "2.5",
      latitude: "0",
      longitude: "101.5",
    },
    {
      plot_id: "8",
      farmer_id: "42",
      farm_name: "Backend farm",
      plot_name: "Backend West",
      plot_size: "4",
      latitude: "1",
      longitude: "102",
    },
  ];
  const nodes = [
    {
      node_id: "11",
      plot_id: "7",
      node_name: "API node",
      status: "OFFLINE",
      battery_level: null,
      firmware_version: "v1",
      last_ping_at: null,
    },
  ];
  const notices = [
    {
      notification_id: "73",
      farmer_id: "42",
      detection_id: "101",
      title: "Backend candidate",
      message_noti: "Inspect this event.",
      created_at: "2026-10-23T09:00:00Z",
      is_read: false,
    },
    {
      notification_id: "74",
      farmer_id: "84",
      detection_id: "202",
      title: "Other farmer secret",
      created_at: "2026-10-23T09:00:00Z",
      is_read: false,
    },
  ];
  await context.route(`${api}/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      pathname = url.pathname.replace("/api", ""),
      method = request.method();
    const body =
      method === "POST" || method === "PATCH" ? request.postDataJSON() : null;
    requests.push({
      path: pathname,
      method,
      body,
      authorization: request.headers().authorization,
    });
    const reply = (status, json) => route.fulfill({ status, json });
    const farmer = {
      farmer_id: farmerId,
      username: `farmer.${farmerId}`,
      full_name: "Test farmer",
    };
    if (pathname === "/auth/login") {
      farmerId = body.username.endsWith("84") ? "84" : "42";
      return reply(200, {
        token: `browser-test-token-${farmerId}`,
        farmer: { ...farmer, farmer_id: farmerId },
      });
    }
    if (pathname === "/auth/session") return reply(200, { farmer });
    if (pathname === "/auth/logout")
      return reply(200, { message: "Logged out" });
    if (pathname === "/detections")
      return reply(200, {
        items: [
          {
            detection_id: "101",
            detection_at: "2026-10-23T09:00:00Z",
            detection_status: "PENDING",
            prediction: "DURIAN",
            confidence: "80",
            node_name: "API node",
            images: [],
          },
        ],
        next_cursor: null,
      });
    if (pathname === "/detections/101")
      return reply(200, {
        detection_id: "101",
        detection_at: "2026-10-23T09:00:00Z",
        detection_status: "PENDING",
        prediction: "DURIAN",
        confidence: "80",
        node_name: "API node",
        images: [],
      });
    if (pathname === "/nodes") return reply(200, nodes);
    if (pathname === "/feedback-categories")
      return reply(200, [{ category_id: "27", category_name: "Other" }]);
    if (pathname === `/farmers/${farmerId}/plots` && method === "GET")
      return reply(
        listFailure ? 503 : 200,
        listFailure
          ? { error: "Test-only plots outage" }
          : plots.filter((p) => p.farmer_id === farmerId),
      );
    if (pathname === `/farmers/${farmerId}/plots` && method === "POST") {
      const plot = { ...body, plot_id: "9", farmer_id: farmerId };
      plots.push(plot);
      return reply(201, plot);
    }
    if (pathname.startsWith("/plots/") && method === "PATCH") {
      if (!writes) return reply(404, { error: "Route not found" });
      const index = plots.findIndex(
        (p) => p.plot_id === pathname.split("/")[2],
      );
      plots[index] = { ...plots[index], ...body };
      return reply(200, plots[index]);
    }
    if (/^\/plots\/\d+\/nodes$/.test(pathname)) {
      const plotId = pathname.split("/")[2];
      if (method === "GET")
        return reply(
          nodeFailure ? 503 : 200,
          nodeFailure
            ? { error: "Test-only nodes outage" }
            : nodes.filter((n) => n.plot_id === plotId),
        );
      if (!writes) return reply(404, { error: "Route not found" });
      const node = {
        ...body,
        node_id: "12",
        plot_id: plotId,
        status: "OFFLINE",
        battery_level: null,
        last_ping_at: null,
      };
      nodes.push(node);
      return reply(201, node);
    }
    if (pathname.startsWith("/nodes/") && method === "PATCH") {
      if (!writes) return reply(404, { error: "Route not found" });
      const index = nodes.findIndex(
        (n) => n.node_id === pathname.split("/")[2],
      );
      nodes[index] = { ...nodes[index], ...body };
      return reply(200, nodes[index]);
    }
    if (pathname === "/notifications") return reply(200, notices);
    if (/^\/notifications\/\d+\/read$/.test(pathname)) {
      if (!writes) return reply(404, { error: "Route not found" });
      const note = notices.find(
        (n) => n.notification_id === pathname.split("/")[2],
      );
      note.is_read = true;
      return reply(200, note);
    }
    return reply(404, { error: "Route not found" });
  });
  async function login(id = "42") {
    await page.goto(`${base}/login`);
    await page.getByLabel("Username", { exact: true }).fill(`farmer.${id}`);
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/dashboard");
  }
  const source = () => page.getByLabel("Management data source");
  async function goto(route) {
    await page.goto(`${base}${route}`);
    await source().waitFor();
  }
  async function fillPlot(name = "East") {
    for (const [label, value] of [
      ["Farm name", "Test farm"],
      ["Plot name", name],
      ["Plot size (hectares)", "2.5"],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
  }
  async function createPlot(name) {
    await page
      .getByRole("button", { name: "Create plot", exact: true })
      .click();
    await fillPlot(name);
    await page.getByRole("button", { name: "Save plot", exact: true }).click();
    await page
      .getByText("Plot saved in this browser simulation.", { exact: true })
      .waitFor();
  }
  await login();
  await goto("/plots");
  assert.equal(await source().inputValue(), "simulation");
  await page.getByText("No plots yet.", { exact: false }).waitFor();
  await createPlot("East");
  await page.getByRole("button", { name: "Edit plot", exact: true }).click();
  await page.getByLabel("Plot name", { exact: true }).fill("Cancelled edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "East", exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Edit plot", exact: true }).click();
  await page.getByLabel("Plot name", { exact: true }).fill("East updated");
  await page.getByRole("button", { name: "Save plot", exact: true }).click();
  await page
    .getByRole("button", { name: "East updated", exact: true })
    .waitFor();
  await createPlot("West");
  await page.getByRole("button", { name: "East updated", exact: true }).click();
  const selectedPlotId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("duriai.farm-simulation.v1.42"))
        .selectedPlotId,
  );
  await goto("/nodes");
  assert.equal(
    await page.getByLabel("Selected farm plot").inputValue(),
    selectedPlotId,
  );
  await page
    .getByRole("button", { name: "Register node", exact: true })
    .click();
  await page.getByLabel("Node name", { exact: true }).fill("Node A");
  await page
    .getByLabel("Firmware version (optional)", { exact: true })
    .fill("v1");
  await page.getByRole("button", { name: "Save node", exact: true }).click();
  await page.getByRole("button", { name: "Node A", exact: true }).waitFor();
  assert.match(await page.locator("tbody").innerText(), /OFFLINE/);
  assert.match(await page.locator("tbody").innerText(), /Unavailable/);
  await page
    .getByRole("button", { name: "Edit / reassign node", exact: true })
    .click();
  await page
    .getByLabel("Assigned farm plot")
    .selectOption({ label: "Test farm · West" });
  await page.getByRole("button", { name: "Save node", exact: true }).click();
  await page
    .getByRole("button", { name: "Simulate online", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Simulate online", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simulate offline", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Simulate candidate event", exact: true })
    .click();
  await page
    .getByText("Simulated candidate and unread notification created.", {
      exact: false,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Edit / reassign node", exact: true })
    .click();
  await page
    .getByLabel("Assigned farm plot")
    .selectOption({ label: "Test farm · East updated" });
  await page.getByRole("button", { name: "Save node", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "event history" }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await goto("/notifications");
  await page
    .getByRole("button", {
      name: "Simulated candidate needs review",
      exact: true,
    })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Mark as read", exact: true })
      .isEnabled(),
    true,
  );
  const before = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("duriai.farm-simulation.v1.42"))
        .notifications[0].is_read,
  );
  assert.equal(before, false);
  await page
    .getByRole("link", { name: "View detection details", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Simulated candidate · awaiting verification",
      exact: true,
    })
    .waitFor();
  assert.match(await page.locator(".farm-facts").innerText(), /Node A/);
  assert.match(await page.locator(".farm-facts").innerText(), /West/);
  await page
    .getByRole("link", { name: "Back to notifications", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Simulated candidate needs review",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await page
    .getByRole("button", { name: "Already read", exact: true })
    .waitFor();
  await page.getByLabel("Show notifications").selectOption("unread");
  await page.getByText("No unread notifications.", { exact: true }).waitFor();
  await page.reload();
  await page
    .getByRole("button", {
      name: "Simulated candidate needs review",
      exact: true,
    })
    .waitFor();
  assert.equal(
    requests.filter((r) => !r.path.startsWith("/auth/") && r.method !== "GET")
      .length,
    0,
  );
  await page.goto(`${base}/analytics`);
  await page
    .getByRole("link", { name: "View event 101 on", exact: false })
    .waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
  assert.doesNotMatch(await page.locator("tbody").innerText(), /Node A/);
  // Existing backend reads and plot creation, followed by explicitly missing writes.
  await goto("/plots");
  await source().selectOption("backend");
  await page
    .getByRole("button", { name: "Backend East", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Backend East", exact: true }).click();
  await page.getByRole("button", { name: "Edit plot", exact: true }).click();
  await page.getByLabel("Plot name", { exact: true }).fill("API edited");
  await page.getByRole("button", { name: "Save plot", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "not available on the current backend" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Plot name", { exact: true }).inputValue(),
    "API edited",
  );
  assert.equal(plots[0].plot_name, "Backend East");
  writes = true;
  await page.getByRole("button", { name: "Save plot", exact: true }).click();
  await page.getByRole("button", { name: "API edited", exact: true }).waitFor();
  await page.getByRole("button", { name: "Create plot", exact: true }).click();
  await fillPlot("API created");
  await page.getByRole("button", { name: "Save plot", exact: true }).click();
  await page
    .getByRole("button", { name: "API created", exact: true })
    .waitFor();
  const create = requests.find(
    (r) => r.method === "POST" && r.path === "/farmers/42/plots",
  );
  assert.equal(create.body.latitude, undefined);
  assert.equal(create.body.longitude, undefined);
  assert.equal(create.authorization, "Bearer browser-test-token-42");
  await goto("/nodes");
  await page.getByLabel("Selected farm plot").selectOption("7");
  await page.getByRole("button", { name: "API node", exact: true }).waitFor();
  writes = false;
  await page
    .getByRole("button", { name: "Register node", exact: true })
    .click();
  await page.getByLabel("Node name", { exact: true }).fill("API new");
  await page.getByRole("button", { name: "Save node", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "not available on the current backend" })
    .waitFor();
  assert.equal(nodes.length, 1);
  writes = true;
  await page.getByRole("button", { name: "Save node", exact: true }).click();
  await page.getByRole("button", { name: "API new", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Edit / reassign node", exact: true })
    .click();
  await page.getByLabel("Assigned farm plot").selectOption("8");
  await page.getByRole("button", { name: "Save node", exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById("farm-selected-plot").value === "8",
  );
  await page.getByRole("button", { name: "API new", exact: true }).waitFor();
  assert.equal(nodes.find((n) => n.node_id === "12").plot_id, "8");
  assert.equal(
    await page
      .getByRole("button", { name: "Simulate candidate event", exact: true })
      .count(),
    0,
  );
  nodeFailure = true;
  await page
    .getByRole("button", { name: "Refresh nodes", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Displayed records may be stale" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Register node", exact: true })
      .isDisabled(),
    true,
  );
  nodeFailure = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  await goto("/notifications");
  await page
    .getByRole("button", { name: "Backend candidate", exact: true })
    .click();
  assert.equal(
    await page.getByText("Other farmer secret", { exact: true }).count(),
    0,
  );
  writes = false;
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "not available on the current backend" })
    .waitFor();
  assert.equal(notices[0].is_read, false);
  writes = true;
  await page.getByRole("button", { name: "Mark as read", exact: true }).click();
  await page
    .getByRole("button", { name: "Already read", exact: true })
    .waitFor();
  assert.equal(notices[0].is_read, true);
  await page
    .getByRole("link", { name: "View detection details", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "What happened?", exact: true })
    .waitFor();
  await goto("/plots");
  await page
    .getByRole("button", { name: "API created", exact: true })
    .waitFor();
  listFailure = true;
  await page
    .getByRole("button", { name: "Refresh plots", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Displayed records may be stale" })
    .waitFor();
  listFailure = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  await source().selectOption("simulation");
  await page
    .getByRole("button", { name: "East updated", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "API created", exact: true })
      .count(),
    0,
  );
  // A failed browser save retains the draft and never reports a successful save.
  await page.getByRole("button", { name: "Create plot", exact: true }).click();
  await fillPlot("Should not save");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.restoreFarmStorage = () => (Storage.prototype.setItem = original);
    Storage.prototype.setItem = function (key, value) {
      if (key === "duriai.farm-simulation.v1.42")
        throw new Error("Test-only storage failure");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save plot", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Test-only storage failure" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Plot name", { exact: true }).inputValue(),
    "Should not save",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Should not save", exact: true })
      .count(),
    0,
  );
  await page.evaluate(() => window.restoreFarmStorage());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/plots", "/nodes", "/notifications"]) {
      await goto(route);
      if (route === "/plots") {
        await page
          .getByRole("button", { name: "Create plot", exact: true })
          .click();
        await fillPlot("Unsaved layout check");
      } else if (route === "/nodes") {
        await page
          .getByRole("button", { name: "Register node", exact: true })
          .click();
        await page
          .getByLabel("Node name", { exact: true })
          .fill("Unsaved layout check");
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `Overflow ${route} at ${width}`,
      );
      await page.screenshot({
        path: `/tmp/duri-farm-${width}-${route.slice(1)}.png`,
        fullPage: true,
      });
    }
    if (width === 320) {
      await page.locator(".app-nav-more summary").click();
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".app-nav-more").evaluate((el) => el.open),
        false,
      );
      await page.locator(".app-nav-more summary").click();
      await page
        .locator(".app-more-menu")
        .getByRole("link", { name: "Farm plots", exact: true })
        .click();
      await page.waitForURL("**/plots");
      assert.equal(
        await page.locator(".app-nav-more").evaluate((el) => el.open),
        false,
      );
    }
  }
  // Corrupt data is not silently overwritten; reset is explicit and cancellable.
  await page.evaluate(() =>
    localStorage.setItem("duriai.farm-simulation.v1.42", "{broken"),
  );
  await goto("/plots");
  await page
    .getByRole("alert")
    .filter({ hasText: "Saved simulation data could not be read" })
    .waitFor();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Reset farm simulation", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("duriai.farm-simulation.v1.42"),
    ),
    "{broken",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Reset farm simulation", exact: true })
    .click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  await createPlot("Account 42 only");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Log out", exact: true })
    .filter({ visible: true })
    .click();
  await page.waitForURL((url) => ["/", "/login"].includes(url.pathname));
  await login("84");
  await goto("/plots");
  await page.getByText("No plots yet.", { exact: false }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Account 42 only", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS frontend simulation creation/edit/cancel/selection, node registration/assignment/history/status, candidate notifications/read filters/event links, persistence/account isolation/storage failures/reset, backend contract success/missing endpoint/stale states, source separation and 320/390/1440 layouts. API responses were mocked.",
  );
}
main()
  .finally(async () => {
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      const done = once(child, "exit");
      child.kill();
      await done;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
