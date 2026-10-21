// Run against a disposable backend database, with the frontend dev server running.
// Playwright is a test tool, not an application dependency.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.DURI_FRONTEND_URL || "http://127.0.0.1:5174";
const api = process.env.DURI_API_URL || "http://127.0.0.1:3001/api";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().startsWith(api))
      requests.push({
        path: new URL(request.url()).pathname,
        authorization: request.headers().authorization,
      });
  });
  page.setDefaultTimeout(10000);
  const suffix = Date.now();
  const username = `browser.${suffix}`;
  const password = "test-password-2026";
  try {
    await page.goto(`${base}/register`);
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Browser test farmer");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Phone number", { exact: true }).fill("+60123456789");
    await page
      .getByLabel("Email address", { exact: true })
      .fill(`browser.${suffix}@example.invalid`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Register", exact: true }).click();
    await page.waitForURL("**/login");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("token")),
      null,
    );
    assert.equal(
      await page.getByLabel("Username", { exact: true }).inputValue(),
      username,
    );
    await page.getByLabel("Password", { exact: true }).fill("incorrect");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Invalid username or password" })
      .waitFor();
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    const token = await page.evaluate(() => localStorage.getItem("token"));
    assert.ok(token);
    await page.reload();
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    assert.ok(
      requests.some(
        (request) =>
          request.path.endsWith("/auth/session") &&
          request.authorization === `Bearer ${token}`,
      ),
    );
    await page.locator("#dashboard-source").selectOption("live");
    await page
      .getByRole("heading", { name: "Sensor nodes · Plot 1", exact: true })
      .waitFor();
    assert.ok(
      requests.some(
        (request) =>
          request.path.endsWith("/detections") &&
          request.authorization === `Bearer ${token}`,
      ),
    );
    const peer = await context.newPage();
    await peer.goto(`${base}/map`);
    await peer
      .getByRole("heading", { name: "Orchard Map", exact: true })
      .waitFor();
    // Logout failure must retain credentials and the signed-in screen.
    await page.route("**/api/auth/logout", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Logout temporarily unavailable" }),
      }),
    );
    page.on("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Log out", exact: true })
      .filter({ visible: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Logout temporarily unavailable" })
      .waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("token")),
      token,
    );
    await page.unroute("**/api/auth/logout");
    await page
      .getByRole("button", { name: "Log out", exact: true })
      .filter({ visible: true })
      .click();
    await page.waitForURL((url) => ["/", "/login"].includes(url.pathname));
    assert.equal(
      await page.evaluate(() => localStorage.getItem("token")),
      null,
    );
    await peer.waitForURL("**/login");
    const revoked = await fetch(`${api}/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(revoked.status, 401);
    await peer.close();
    // A saved profile is not proof of a login: invalid JWTs return to login.
    await page.evaluate(() => {
      localStorage.setItem("token", "invalid.jwt");
      localStorage.setItem("farmer", "{broken");
    });
    await page.goto(`${base}/dashboard`);
    await page.waitForURL("**/login");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("token")),
      null,
    );
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/login`);
      await page.getByRole("heading", { name: "Login", exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: `/tmp/duri-auth-login-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS real registration, failed login/retry, JWT API headers, reload/session restore, failed logout/retry, server revocation, cross-tab logout, invalid credentials cleanup and unchanged responsive login.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
