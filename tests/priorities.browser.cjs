// Actual PostgreSQL/API/UI workflow. Device heartbeat is simulated through the device API.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { chromium } = require("playwright");
const {
  backendFixture,
  freePort,
  waitReady,
} = require("./helpers/backend.cjs");
async function main() {
  const webPort = await freePort(),
    base = `http://127.0.0.1:${webPort}`;
  const fixture = await backendFixture({ FRONTEND_ORIGINS: base });
  let frontend, browser;
  try {
    const account = await fixture.account("browser.farmer");
    const own = (method, body) => ({ method, body, token: account.token });
    const createPlot = async (name) =>
      (
        await fixture.request(
          `/farmers/${account.farmer_id}/plots`,
          own("POST", {
            farm_name: "Test orchard",
            plot_name: name,
            plot_size: 2,
          }),
        )
      ).body;
    const east = await createPlot("East"),
      west = await createPlot("West");
    const node = (
      await fixture.request(
        `/plots/${east.plot_id}/nodes`,
        own("POST", { node_name: "History node" }),
      )
    ).body;
    const reading = (
      await fixture.pool.query(
        "INSERT INTO sensor_reading(node_id,amplitude,frequency) VALUES ($1,0,20) RETURNING reading_id",
        [node.node_id],
      )
    ).rows[0];
    const events = (
      await fixture.pool.query(
        `INSERT INTO detection(reading_id,prediction,confidence,detection_status,detection_at)
      SELECT $1,CASE WHEN i%2=0 THEN 'DURIAN' ELSE 'NOT_DURIAN' END,80,'REJECTED',TIMESTAMPTZ '2026-10-23 10:00:00Z'+i*INTERVAL '1 second'
      FROM generate_series(1,45) i RETURNING detection_id`,
        [reading.reading_id],
      )
    ).rows;
    await fixture.pool.query(
      "INSERT INTO feedback_category(category_name,description) VALUES ('Animal','Test-only category')",
    );
    let output = "";
    frontend = spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        String(webPort),
        "--strictPort",
      ],
      {
        cwd: fixture.root,
        env: { ...process.env, VITE_API_URL: fixture.base },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    frontend.stdout.on("data", (data) => (output += data));
    frontend.stderr.on("data", (data) => (output += data));
    await waitReady(base, () => output);
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage({
      viewport: { width: 390, height: 900 },
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    // Basemap delivery is outside this workflow; do not contact a real map provider.
    await page.route("**/*.tile.openstreetmap.org/**", (route) =>
      route.abort(),
    );
    await page.goto(`${base}/login`);
    await page.getByLabel("Username", { exact: true }).fill(account.username);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`${base}/plots`);
    await page.getByLabel("Management data source").selectOption("backend");
    await page.getByRole("button", { name: "East", exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Create plot", exact: true })
      .click();
    assert.equal(await page.getByLabel("Latitude", { exact: true }).count(), 0);
    await page.getByLabel("Farm name", { exact: true }).fill("Test orchard");
    await page.getByLabel("Plot name", { exact: true }).fill("Temporary");
    await page.getByLabel("Plot size (hectares)", { exact: true }).fill("1.5");
    await page.getByRole("button", { name: "Save plot", exact: true }).click();
    await page
      .getByText("Plot saved by the backend.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Edit plot", exact: true }).click();
    await page
      .getByLabel("Plot name", { exact: true })
      .fill("Temporary edited");
    await page.getByRole("button", { name: "Save plot", exact: true }).click();
    await page
      .getByRole("heading", { name: "Temporary edited", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Delete plot", exact: true })
      .click();
    await page
      .getByText("Plot deleted by the backend.", { exact: true })
      .waitFor();
    assert.equal(
      (
        await fixture.pool.query(
          "SELECT count(*)::int n FROM farm_plot WHERE plot_name='Temporary edited'",
        )
      ).rows[0].n,
      0,
    );
    await page.goto(`${base}/nodes`);
    await page.getByLabel("Selected farm plot").selectOption(east.plot_id);
    await page
      .getByRole("button", { name: "Register node", exact: true })
      .click();
    await page.getByLabel("Node name", { exact: true }).fill("Unused node");
    await page.getByRole("button", { name: "Save node", exact: true }).click();
    await page
      .getByRole("heading", { name: "Unused node", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Edit / reassign node", exact: true })
      .click();
    await page.getByLabel("Assigned farm plot").selectOption(west.plot_id);
    await page.getByRole("button", { name: "Save node", exact: true }).click();
    await page
      .getByRole("heading", { name: "Unused node", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Selected farm plot").inputValue(),
      west.plot_id,
    );
    await page
      .getByRole("button", { name: "Disable node", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Enable node", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Enable node", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Disable node", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Delete node", exact: true })
      .click();
    await page
      .getByText("Node deleted by the backend.", { exact: true })
      .waitFor();
    await page.getByLabel("Selected farm plot").selectOption(east.plot_id);
    await page
      .getByRole("button", { name: "History node", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Delete node", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "sensor history" })
      .waitFor();
    await page
      .getByRole("button", { name: "Edit / reassign node", exact: true })
      .click();
    await page.getByLabel("Assigned farm plot").selectOption(west.plot_id);
    await page.getByRole("button", { name: "Save node", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "cannot be reassigned" })
      .waitFor();
    // Old REJECTED event is beyond the first history page. It must still open and be correctable.
    await page.goto(`${base}/map/events/${events[0].detection_id}`);
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .waitFor();
    await page.getByRole("radio", { name: "No Durian", exact: true }).check();
    assert.equal(
      await page
        .getByLabel("Feedback category", { exact: false })
        .evaluate((element) => element.required),
      true,
    );
    assert.equal(
      await page
        .getByLabel("Detailed comments", { exact: false })
        .evaluate((element) => element.required),
      false,
    );
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .click();
    assert.equal(
      (
        await fixture.pool.query(
          "SELECT count(*)::int n FROM detection_feedback",
        )
      ).rows[0].n,
      0,
    );
    await page.getByRole("radio", { name: "Durian", exact: true }).check();
    assert.equal(
      await page
        .getByLabel("Feedback category", { exact: false })
        .evaluate((element) => element.required),
      false,
    );
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .click();
    await page
      .getByText("Feedback accepted by the server.", { exact: true })
      .waitFor();
    await page.evaluate(() => sessionStorage.clear());
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
    await page.goto(`${base}/map/events/${events[1].detection_id}`);
    await page.getByRole("radio", { name: "No Durian", exact: true }).check();
    await page
      .getByLabel("Feedback category", { exact: false })
      .selectOption({ label: "Animal" });
    await page
      .getByRole("button", { name: "Submit feedback", exact: true })
      .click();
    await page
      .getByText("Feedback accepted by the server.", { exact: true })
      .waitFor();
    await page.goto(`${base}/analytics`);
    await page.locator("tbody tr").first().waitFor();
    assert.equal(await page.locator("tbody tr").count(), 20);
    assert.deepEqual(await page.locator("thead th").allTextContents(), [
      "Date",
      "Time (MYT)",
      "Detection type",
      "Node",
    ]);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.getByText("Page 2", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Next page", exact: true })
      .waitFor({ state: "visible" });
    await page.waitForFunction(
      () =>
        document.querySelector(
          'nav[aria-label="Harvest log pages"] button:last-child',
        )?.disabled === false,
    );
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await page.getByText("Page 3", { exact: true }).waitFor();
    await page
      .getByRole("link", {
        name: `View event ${events[0].detection_id} on`,
        exact: false,
      })
      .waitFor();
    assert.equal(await page.locator("tbody tr").count(), 5);
    await page
      .getByRole("link", {
        name: `View event ${events[0].detection_id} on`,
        exact: false,
      })
      .click();
    await page
      .getByText("Feedback accepted by the server.", { exact: true })
      .waitFor();
    await page.goto(`${base}/analytics`);
    await page.getByLabel("Detection type").selectOption("DURIAN");
    await page.locator("tbody tr").first().waitFor();
    assert.ok(
      (await page.locator("tbody tr td:nth-child(3)").allTextContents()).every(
        (text) => text === "Durian",
      ),
    );
    // No fabricated pins appear before a device supplies coordinates.
    await page.goto(`${base}/map`);
    await page
      .getByText("No node locations have been reported.", { exact: false })
      .waitFor();
    assert.equal(await page.locator(".leaflet-container").count(), 0);
    const heartbeat = await fixture.request(
      `/device/nodes/${node.node_id}/heartbeat`,
      {
        method: "POST",
        device: true,
        body: { latitude: 0, longitude: 101.5, battery_level: 80 },
      },
    );
    assert.equal(heartbeat.status, 200);
    await page
      .getByRole("button", { name: "Refresh node locations", exact: true })
      .click();
    await page.locator(".leaflet-container").waitFor();
    assert.equal(await page.locator(".leaflet-interactive").count(), 1);
    await page.locator(".leaflet-interactive").click();
    await page
      .locator(".leaflet-popup-content")
      .getByText("Location reported", { exact: false })
      .waitFor();
    await page.goto(`${base}/training`);
    await page
      .getByRole("heading", { name: "AI Training History", exact: true })
      .waitFor();
    await page
      .getByText("No evaluated model results are available.", { exact: false })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Retrain AI Now", exact: true })
        .isDisabled(),
      true,
    );
    assert.doesNotMatch(
      await page.locator("main").innerText(),
      /99\.93|85%|92%|model is now smarter|Est\./i,
    );
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        "/plots",
        "/nodes",
        "/map",
        "/analytics",
        "/training",
      ]) {
        await page.goto(`${base}${route}`);
        await page.getByRole("heading", { level: 1 }).waitFor();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          `Overflow at ${width}: ${route}`,
        );
        if (width === 390)
          await page.screenshot({
            path: `/tmp/duri-priorities-${route.slice(1)}.png`,
            fullPage: true,
          });
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual plot CRUD without coordinates, node registration/reassignment/enable/delete/history protection, old REJECTED event correction, optional category/comments, server feedback restore, 45-event pagination/type filtering, device-only map positions, truthful training and 320/390/1440 layouts. Basemap delivery was not tested.",
    );
  } catch (error) {
    if (browser) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      for (const page of pages) {
        console.error(
          "Failed page:",
          page.url(),
          (await page.locator("body").innerText()).slice(0, 2000),
        );
        await page.screenshot({
          path: "/tmp/duri-priorities-failure.png",
          fullPage: true,
        });
      }
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (frontend && frontend.exitCode === null) {
      const exited = once(frontend, "exit");
      frontend.kill("SIGTERM");
      await exited;
    }
    await fixture.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
