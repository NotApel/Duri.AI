// Actual backend, PostgreSQL and a local SMTP mailbox; no external email is sent.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const path = require("node:path");
const { readFile } = require("node:fs/promises");
const { Pool } = require("../backend/node_modules/pg");
const { chromium } = require("playwright");
const { startSmtp, resetLink } = require("./helpers/smtp.cjs");
const root = path.resolve(__dirname, "..");
const configuration = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
};
const database = `duri_recovery_browser_${process.pid}_${Date.now()}`;
const admin = new Pool({ ...configuration, database: "postgres" }),
  pool = new Pool({ ...configuration, database });
let browser,
  smtp,
  created = false;
const children = [];
async function port() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const value = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return value;
}
function start(script, args, cwd, env) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let logs = "";
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  return () => logs;
}
async function ready(url, logs) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start: ${logs()}`);
}
async function main() {
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
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
  smtp = await startSmtp();
  const apiPort = await port(),
    webPort = await port(),
    base = `http://127.0.0.1:${webPort}`,
    api = `http://127.0.0.1:${apiPort}/api`;
  const backendLogs = start("app.js", [], path.join(root, "backend"), {
    DB_HOST: configuration.host,
    DB_PORT: String(configuration.port),
    DB_USER: configuration.user,
    DB_PASSWORD: configuration.password || "",
    DB_NAME: database,
    PORT: String(apiPort),
    JWT_SECRET: "disposable-recovery-browser-secret",
    FRONTEND_ORIGINS: base,
    FRONTEND_URL: base,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtp.port),
    SMTP_SECURE: "false",
    SMTP_FROM: "noreply@duri.test",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
  });
  async function waitProcessed(count) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (
        backendLogs().split("Password recovery request processed.").length -
          1 >=
        count
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Recovery email processing did not finish.");
  }
  await ready(`${api}/health`, backendLogs);
  const frontendLogs = start(
    "node_modules/vite/bin/vite.js",
    ["--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
    root,
    { VITE_API_URL: api },
  );
  await ready(base, frontendLogs);
  const account = {
    full_name: "Recovery browser farmer",
    username: "recovery.browser",
    email: "browser@example.invalid",
    phone_number: "+60123456789",
    password: "original-browser-password",
  };
  assert.equal(
    (
      await fetch(`${api}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(account),
      })
    ).status,
    201,
  );
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  const errors = [],
    requests = [];
  context.on("page", (tab) => {
    tab.setDefaultTimeout(10000);
    tab.on("pageerror", (error) => errors.push(error.message));
  });
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  context.on("request", (request) => {
    if (request.url().startsWith(api))
      requests.push({
        url: request.url(),
        method: request.method(),
        body: request.postData(),
        authorization: request.headers().authorization,
      });
  });
  await page.goto(`${base}/login`);
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Forgot password", exact: true })
    .waitFor();
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.route("**/api/auth/forgot-password", (route) =>
    route.fulfill({ status: 503, json: { error: "Test-only email outage" } }),
  );
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Test-only email outage" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Email address", { exact: true }).inputValue(),
    account.email,
  );
  await page.unroute("**/api/auth/forgot-password");
  const before = requests.filter((r) =>
    r.url.endsWith("/auth/forgot-password"),
  ).length;
  await page.locator("form").evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await page
    .getByRole("status")
    .filter({ hasText: "If an account matches" })
    .waitFor();
  await waitProcessed(1);
  assert.equal(smtp.messages.length, 1);
  assert.equal(
    requests.filter((r) => r.url.endsWith("/auth/forgot-password")).length,
    before + 1,
  );
  const link = resetLink(smtp.messages[0]);
  assert.equal(link.origin, base);
  const rawToken = new URLSearchParams(link.hash.slice(1)).get("token");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("unknown@example.invalid");
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "If an account matches" })
    .waitFor();
  await waitProcessed(2);
  assert.equal(smtp.messages.length, 1);
  await page.getByRole("link", { name: "Back to login", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/dashboard");
  const oldToken = await page.evaluate(() => localStorage.getItem("token"));
  assert.ok(oldToken);
  const resetPage = await context.newPage();
  await resetPage.goto(link.href);
  await resetPage
    .getByRole("heading", { name: "Reset password", exact: true })
    .waitFor();
  await resetPage.waitForFunction(() => location.hash === "");
  const password = "new-browser-password-2026";
  await resetPage.getByLabel("New password", { exact: true }).fill(password);
  await resetPage
    .getByLabel("Confirm new password", { exact: true })
    .fill("does-not-match");
  await resetPage
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await resetPage
    .getByRole("alert")
    .filter({ hasText: "do not match" })
    .waitFor();
  assert.equal(
    requests.filter((r) => r.url.endsWith("/auth/reset-password")).length,
    0,
  );
  await resetPage
    .getByLabel("Confirm new password", { exact: true })
    .fill(password);
  await resetPage.route("**/api/auth/reset-password", (route) =>
    route.fulfill({ status: 503, json: { error: "Test-only reset outage" } }),
  );
  await resetPage
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await resetPage
    .getByRole("alert")
    .filter({ hasText: "Test-only reset outage" })
    .waitFor();
  assert.equal(
    await resetPage.getByLabel("New password", { exact: true }).inputValue(),
    password,
  );
  await resetPage.unroute("**/api/auth/reset-password");
  const posts = requests.filter((r) =>
    r.url.endsWith("/auth/reset-password"),
  ).length;
  await resetPage.locator("form").evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await resetPage
    .getByRole("status")
    .filter({ hasText: "Your password has been reset" })
    .waitFor();
  assert.equal(
    requests.filter((r) => r.url.endsWith("/auth/reset-password")).length,
    posts + 1,
  );
  assert.equal(await resetPage.locator("form").count(), 0);
  await page.waitForURL("**/login");
  assert.equal(
    await resetPage.evaluate(() => localStorage.getItem("token")),
    null,
  );
  assert.equal(
    (
      await fetch(`${api}/auth/session`, {
        headers: { Authorization: `Bearer ${oldToken}` },
      })
    ).status,
    401,
  );
  await resetPage
    .getByRole("link", { name: "Back to login", exact: true })
    .click();
  await resetPage
    .getByLabel("Username", { exact: true })
    .fill(account.username);
  await resetPage.getByLabel("Password", { exact: true }).fill(password);
  await resetPage.getByRole("button", { name: "Login", exact: true }).click();
  await resetPage.waitForURL("**/dashboard");
  // Reopening a consumed link must not change the new password.
  await resetPage.goto(link.href);
  await resetPage
    .getByLabel("New password", { exact: true })
    .fill("replay-must-fail");
  await resetPage
    .getByLabel("Confirm new password", { exact: true })
    .fill("replay-must-fail");
  await resetPage
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await resetPage
    .getByRole("alert")
    .filter({ hasText: "invalid or expired" })
    .waitFor();
  await resetPage
    .getByRole("link", { name: "Request a new link", exact: true })
    .click();
  await resetPage
    .getByLabel("Email address", { exact: true })
    .fill(account.email);
  await resetPage
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await resetPage
    .getByRole("status")
    .filter({ hasText: "If an account matches" })
    .waitFor();
  await waitProcessed(3);
  assert.equal(smtp.messages.length, 2);
  const expiredLink = resetLink(smtp.messages[1]);
  await pool.query(
    "UPDATE farmer_password_reset SET expires_at=NOW()-INTERVAL '1 second'",
  );
  await resetPage.goto(expiredLink.href);
  await resetPage
    .getByLabel("New password", { exact: true })
    .fill("expired-must-fail");
  await resetPage
    .getByLabel("Confirm new password", { exact: true })
    .fill("expired-must-fail");
  await resetPage
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await resetPage
    .getByRole("alert")
    .filter({ hasText: "invalid or expired" })
    .waitFor();
  await resetPage.goto(`${base}/reset-password`);
  await resetPage
    .getByRole("alert")
    .filter({ hasText: "incomplete or invalid" })
    .waitFor();
  assert.equal(await resetPage.locator("form").count(), 0);
  for (const width of [320, 390, 1440]) {
    await resetPage.setViewportSize({ width, height: 900 });
    for (const [route, title] of [
      ["/forgot-password", "Forgot password"],
      [link.pathname + link.hash, "Reset password"],
    ]) {
      await resetPage.goto(base + route);
      await resetPage
        .getByRole("heading", { name: title, exact: true })
        .waitFor();
      assert.equal(
        await resetPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.match(
        await resetPage
          .locator("h1")
          .evaluate((el) => getComputedStyle(el).fontFamily),
        /Montserrat/,
      );
      await resetPage.screenshot({
        path: `/tmp/duri-password-${width}-${title.replace(" ", "-")}.png`,
        fullPage: true,
      });
    }
  }
  assert.equal(
    requests.some((r) => r.url.includes(rawToken)),
    false,
  );
  assert.equal(
    requests
      .filter(
        (r) =>
          r.url.endsWith("/auth/forgot-password") ||
          r.url.endsWith("/auth/reset-password"),
      )
      .some((r) => r.authorization),
    false,
  );
  assert.equal(backendLogs().includes(rawToken), false);
  assert.deepEqual(errors, []);
  console.log(
    "PASS actual SMTP recovery link, private responses, existing login layout, failure/retry, matching passwords, double-submit protection, reset/new login, session revocation/cross-tab logout, expired/replayed/missing links, no URL/auth-header token leakage and 320/390/1440 layouts.",
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
    if (smtp) await smtp.close();
    await pool.end();
    if (created) {
      // Let disconnected PostgreSQL backends exit before dropping the test DB.
      // FORCE can terminate a closing pg client before its end event is processed.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const result = await admin.query(
          "SELECT count(*) FROM pg_stat_activity WHERE datname=$1",
          [database],
        );
        if (result.rows[0].count === "0") break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await admin.query(`DROP DATABASE ${database}`);
    }
    await admin.end();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
