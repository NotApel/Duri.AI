const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const { readFile } = require("node:fs/promises");
const { createHash } = require("node:crypto");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const path = require("node:path");
const { startSmtp, resetLink } = require("../tests/helpers/smtp.cjs");
const configuration = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
};
const admin = new Pool({ ...configuration, database: "postgres" });
const database = `duri_reset_test_${process.pid}_${Date.now()}`;
let pool,
  child,
  smtp,
  base,
  created = false,
  logs = "",
  farmer,
  activeToken,
  initialToken,
  oldSession,
  newPassword;
const account = {
  full_name: "Recovery test",
  username: "recovery.test",
  email: "recovery@example.invalid",
  phone_number: "+60123456789",
  password: "original-password-2026",
};
const token = () =>
  new URLSearchParams(resetLink(smtp.messages.at(-1)).hash.slice(1)).get(
    "token",
  );
async function request(endpoint, body, bearer) {
  const response = await fetch(`${base}/api${endpoint}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}
const completed = () =>
  logs.split("Password recovery request processed.").length - 1;
async function waitProcessed(count) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (completed() >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Recovery background work did not finish.");
}
async function forgot(email = account.email) {
  const count = completed();
  const result = await request("/auth/forgot-password", { email });
  if (result.status === 202) await waitProcessed(count + 1);
  return result;
}
const reset = (value, password = "replacement-password-2026") =>
  request("/auth/reset-password", { token: value, new_password: password });
const login = (password = account.password) =>
  request("/auth/login", { username: account.username, password });
before(async () => {
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  pool = new Pool({ ...configuration, database });
  await pool.query(
    await readFile(path.join(__dirname, "../database/farmer.sql"), "utf8"),
  );
  smtp = await startSmtp();
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["app.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      DB_HOST: configuration.host,
      DB_PORT: String(configuration.port),
      DB_USER: configuration.user,
      DB_PASSWORD: configuration.password || "",
      DB_NAME: database,
      PORT: String(port),
      JWT_SECRET: "disposable-reset-test-secret",
      FRONTEND_URL: "http://localhost:5173",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtp.port),
      SMTP_SECURE: "false",
      SMTP_FROM: "noreply@duri.test",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  const registered = await request("/auth/register", account);
  assert.equal(registered.status, 201);
  farmer = registered.body.farmer;
  const signedIn = await login();
  assert.equal(signedIn.status, 200);
  oldSession = signedIn.body.token;
});
after(async () => {
  if (child && child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill();
    await stopped;
  }
  if (smtp) await smtp.close();
  if (pool) await pool.end();
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
});
test("real SMTP reset email uses a trusted fragment URL, a hash-only token, expiry and private generic responses", async () => {
  const unknown = await forgot("unknown@example.invalid");
  assert.equal(unknown.status, 202);
  assert.equal(smtp.messages.length, 0);
  // The HTTP acknowledgement must not wait for a known account's SMTP delivery.
  const processedBefore = completed();
  const releaseSmtp = smtp.holdNextAcceptance();
  let timer, known;
  try {
    known = await Promise.race([
      request("/auth/forgot-password", { email: account.email.toUpperCase() }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Recovery response waited for SMTP.")),
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    releaseSmtp();
  }
  await waitProcessed(processedBefore + 1);
  assert.equal(known.status, 202);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(smtp.messages.length, 1);
  const link = resetLink(smtp.messages[0]);
  assert.equal(link.origin, "http://localhost:5173");
  assert.equal(link.search, "");
  initialToken = activeToken = token();
  const row = (await pool.query("SELECT * FROM farmer_password_reset")).rows[0];
  assert.equal(
    row.token_hash,
    createHash("sha256").update(activeToken).digest("hex"),
  );
  assert.notEqual(row.token_hash, activeToken);
  assert.ok(row.expires_at.getTime() > Date.now() + 14 * 60 * 1000);
  assert.ok(row.expires_at.getTime() < Date.now() + 16 * 60 * 1000);
  assert.equal(JSON.stringify(known.body).includes(activeToken), false);
  assert.equal(logs.includes(activeToken), false);
  assert.equal((await forgot()).status, 202);
  assert.equal(smtp.messages.length, 1, "one minute email cooldown");
  assert.equal((await login()).status, 200);
});
test("a later delivered link replaces the prior link without changing the password", async () => {
  await pool.query(
    "UPDATE farmer_password_reset SET created_at=NOW()-INTERVAL '2 minutes'",
  );
  assert.equal((await forgot()).status, 202);
  activeToken = token();
  assert.notEqual(activeToken, initialToken);
  assert.equal((await reset(initialToken)).status, 400);
  assert.equal((await login()).status, 200);
});
test("invalid, expired and weak-password requests cannot consume a usable credential", async () => {
  assert.equal((await reset("not-a-token")).status, 400);
  assert.equal((await reset("0".repeat(64))).status, 400);
  await pool.query(
    "UPDATE farmer_password_reset SET expires_at=NOW()-INTERVAL '1 second'",
  );
  assert.equal((await reset(activeToken)).status, 400);
  assert.equal((await forgot()).status, 202);
  activeToken = token();
  assert.equal((await reset(activeToken, "short")).status, 400);
  assert.equal((await reset(activeToken, "é".repeat(40))).status, 400);
  assert.equal(
    (await pool.query("SELECT count(*) FROM farmer_password_reset")).rows[0]
      .count,
    "1",
  );
  assert.equal((await login()).status, 200);
});
test("failed SMTP delivery preserves the previous link and does not disclose account existence", async () => {
  const digest = (
    await pool.query("SELECT token_hash FROM farmer_password_reset")
  ).rows[0].token_hash;
  await pool.query(
    "UPDATE farmer_password_reset SET created_at=NOW()-INTERVAL '2 minutes'",
  );
  smtp.reject(true);
  try {
    const result = await forgot();
    assert.equal(result.status, 202);
    assert.equal(
      result.body.message,
      "If an account matches that email, check its inbox and spam folder for a reset link.",
    );
  } finally {
    smtp.reject(false);
  }
  assert.equal(
    (await pool.query("SELECT token_hash FROM farmer_password_reset")).rows[0]
      .token_hash,
    digest,
  );
  assert.equal(logs.includes(activeToken), false);
  assert.equal(logs.includes(account.email), false);
});
test("only one concurrent reset succeeds, preserves other accounts, revokes sessions and cannot be replayed", async () => {
  const other = {
    ...account,
    username: "other.farmer",
    email: "other@example.invalid",
  };
  assert.equal((await request("/auth/register", other)).status, 201);
  const otherLogin = await request("/auth/login", {
    username: other.username,
    password: other.password,
  });
  assert.equal(otherLogin.status, 200);
  const attempts = await Promise.all([
    reset(activeToken, "replacement-A-2026"),
    reset(activeToken, "replacement-B-2026"),
  ]);
  assert.deepEqual(attempts.map((x) => x.status).sort(), [200, 400]);
  newPassword =
    attempts[0].status === 200 ? "replacement-A-2026" : "replacement-B-2026";
  const row = (
    await pool.query("SELECT password_hash FROM farmer WHERE farmer_id=$1", [
      farmer.farmer_id,
    ])
  ).rows[0];
  assert.equal(await bcrypt.compare(newPassword, row.password_hash), true);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*) FROM farmer_session WHERE farmer_id=$1",
        [farmer.farmer_id],
      )
    ).rows[0].count,
    "0",
  );
  assert.equal(
    (await request("/auth/session", undefined, oldSession)).status,
    401,
  );
  assert.equal(
    (await request("/auth/session", undefined, otherLogin.body.token)).status,
    200,
  );
  assert.equal((await login()).status, 401);
  const signedIn = await login(newPassword);
  assert.equal(signedIn.status, 200);
  oldSession = signedIn.body.token;
  assert.equal((await reset(activeToken)).status, 400);
  assert.equal(
    (await request("/auth/session", undefined, oldSession)).status,
    200,
  );
});
test("a session-table failure rolls back token consumption and password changes", async () => {
  assert.equal((await forgot()).status, 202);
  activeToken = token();
  await pool.query("ALTER TABLE farmer_session RENAME TO unavailable_sessions");
  try {
    assert.equal(
      (await reset(activeToken, "must-not-be-committed")).status,
      503,
    );
  } finally {
    await pool.query(
      "ALTER TABLE unavailable_sessions RENAME TO farmer_session",
    );
  }
  assert.equal((await login(newPassword)).status, 200);
  assert.equal((await login("must-not-be-committed")).status, 401);
  assert.equal(
    (await request("/auth/session", undefined, oldSession)).status,
    200,
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM farmer_password_reset")).rows[0]
      .count,
    "1",
  );
});
async function waitForLocks(count) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await pool.query(
      "SELECT count(*) FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock'",
      [database],
    );
    if (Number(result.rows[0].count) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Test requests did not reach expected row locks.");
}
test("an old-password login already in flight cannot survive a password reset", async () => {
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query(
    "SELECT farmer_id FROM farmer WHERE farmer_id=$1 FOR UPDATE",
    [farmer.farmer_id],
  );
  let loginAttempt, resetAttempt;
  try {
    loginAttempt = login(newPassword);
    await waitForLocks(1);
    resetAttempt = reset(activeToken, "race-safe-password-2026");
    await waitForLocks(2);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  const [signedIn, changed] = await Promise.all([loginAttempt, resetAttempt]);
  assert.equal(signedIn.status, 200);
  assert.equal(changed.status, 200);
  assert.equal(
    (await request("/auth/session", undefined, signedIn.body.token)).status,
    401,
  );
  newPassword = "race-safe-password-2026";
  assert.equal((await login(newPassword)).status, 200);
});
test("recovery endpoints rate-limit repeated attempts without changing passwords", async () => {
  let limited;
  for (let i = 0; i < 12; i++) {
    limited = await forgot("unknown@example.invalid");
    if (limited.status === 429) break;
  }
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  for (let i = 0; i < 22; i++) {
    limited = await reset("invalid");
    if (limited.status === 429) break;
  }
  assert.equal(limited.status, 429);
  assert.equal((await login(newPassword)).status, 200);
});
