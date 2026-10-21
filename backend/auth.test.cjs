// Exercise the real app.js entrypoint against an isolated PostgreSQL database.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { scryptSync } = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createServer } = require("node:net");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { migrateAuth } = require("./auth");
const config = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "postgres",
};
const admin = new Pool(config);
const name = `duri_auth_test_${process.pid}_${Date.now()}`;
const secret = "test-only-secret-for-isolated-auth-integration";
const account = {
  full_name: "Test Farmer",
  username: "test.farmer",
  email: "farmer@example.invalid",
  password: "durian-test-2026",
  phone_number: "+60123456789",
};
let pool,
  child,
  base,
  logs = "",
  created = false,
  schema;
async function request(endpoint, body, token, extra = {}) {
  const response = await fetch(`${base}/api${endpoint}`, {
    ...extra,
    method: extra.method || (body === undefined ? "GET" : "POST"),
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, body: await response.json() };
}
async function login(username = account.username, password = account.password) {
  const result = await request("/auth/login", { username, password });
  assert.equal(result.response.status, 200);
  return result.body.token;
}
before(async () => {
  await admin.query(`CREATE DATABASE ${name}`);
  created = true;
  pool = new Pool({ ...config, database: name });
  schema = await readFile(
    path.join(__dirname, "../database/farmer.sql"),
    "utf8",
  );
  await pool.query(schema.replace(/^.*username.*\r?\n/m, ""));
  await pool.query(
    "INSERT INTO farmer(full_name,email,password_hash,phone_number) VALUES ($1,$2,$3,$4)",
    [
      "Legacy account",
      "legacy@example.invalid",
      "legacy-plaintext-must-not-authenticate",
      "+60123456789",
    ],
  );
  await pool.query(
    "INSERT INTO farmer(full_name,email,password_hash,phone_number) VALUES ($1,$2,$3,$4)",
    [
      "Existing bcrypt account",
      "existing@example.invalid",
      await bcrypt.hash(account.password, 10),
      "+60123456789",
    ],
  );
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(__dirname, "app.js")], {
    cwd: __dirname,
    env: {
      ...process.env,
      DB_HOST: config.host,
      DB_PORT: String(config.port),
      DB_USER: config.user,
      DB_PASSWORD: config.password || "",
      DB_NAME: name,
      PORT: String(port),
      JWT_SECRET: secret,
      DEVICE_API_KEY: "test-device-only",
      FRONTEND_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => {
    logs += data;
  });
  child.stderr.on("data", (data) => {
    logs += data;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(check);
      reject(new Error(`Backend startup timed out: ${logs}`));
    }, 10000);
    const check = setInterval(() => {
      if (logs.includes("Backend running at")) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      } else if (child.exitCode !== null) {
        clearTimeout(timer);
        clearInterval(check);
        reject(new Error(`Backend exited: ${logs}`));
      }
    }, 20);
  });
});
after(async () => {
  if (child && child.exitCode === null) {
    const exit = once(child, "exit");
    child.kill("SIGTERM");
    await exit;
  }
  if (pool) await pool.end();
  if (created) await admin.query(`DROP DATABASE ${name}`);
  await admin.end();
});
test("startup upgrades a username-less table; repeat migration preserves IDs and passwords", async () => {
  const { rows } = await pool.query(
    "SELECT farmer_id, username, password_hash FROM farmer ORDER BY farmer_id",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].username, "farmer_1");
  assert.equal(rows[0].password_hash, "legacy-plaintext-must-not-authenticate");
  assert.equal(rows[1].username, "farmer_2");
  await migrateAuth(pool);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT farmer_id, username, password_hash FROM farmer ORDER BY farmer_id",
      )
    ).rows,
    rows,
  );
  const info = await pool.query(
    "SELECT is_nullable FROM information_schema.columns WHERE table_name='farmer' AND column_name='username' AND table_schema='public'",
  );
  assert.equal(info.rows[0].is_nullable, "NO");
});
test("backfill preserves usernames and avoids case-insensitive generated-name collisions", async () => {
  await pool.query("CREATE SCHEMA collision_test");
  const scoped = new Pool({
    ...config,
    database: name,
    options: "-c search_path=collision_test",
  });
  try {
    await scoped.query(
      schema.replace(
        "username VARCHAR(50) NOT NULL UNIQUE",
        "username VARCHAR(50) UNIQUE",
      ),
    );
    await scoped.query(
      "INSERT INTO farmer(full_name,username,email,password_hash,phone_number) VALUES ('A','FARMER_2','a@example.invalid','original','123456789'),('B',NULL,'b@example.invalid','untouched','123456789')",
    );
    await migrateAuth(scoped);
    const { rows } = await scoped.query(
      "SELECT username,password_hash FROM farmer ORDER BY farmer_id",
    );
    assert.equal(rows[0].username, "FARMER_2");
    assert.equal(rows[1].username, "farmer_2_1");
    assert.equal(rows[1].password_hash, "untouched");
    await migrateAuth(scoped);
  } finally {
    await scoped.end();
  }
});
test("duplicate lowercased emails abort and roll back the complete migration", async () => {
  await pool.query("CREATE SCHEMA duplicate_test");
  const scoped = new Pool({
    ...config,
    database: name,
    options: "-c search_path=duplicate_test",
  });
  try {
    await scoped.query(schema.replace(/^.*username.*\r?\n/m, ""));
    await scoped.query(
      "INSERT INTO farmer(full_name,email,password_hash,phone_number) VALUES ('A','same@example.invalid','one','123456789'),('B','SAME@example.invalid','two','123456789')",
    );
    await assert.rejects(
      migrateAuth(scoped),
      (error) => error.code === "23505",
    );
    const columns = await scoped.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='duplicate_test' AND table_name='farmer' AND column_name='username'",
    );
    assert.equal(columns.rows.length, 0);
    assert.equal(
      (await scoped.query("SELECT count(*)::int AS count FROM farmer")).rows[0]
        .count,
      2,
    );
  } finally {
    await scoped.end();
  }
});
test("registration validates fields, hashes passwords, returns no secrets and rejects case duplicates", async () => {
  assert.equal((await request("/auth/register", {})).response.status, 400);
  for (const password of ["x", "é".repeat(40)])
    assert.equal(
      (await request("/auth/register", { ...account, password })).response
        .status,
      400,
    );
  const result = await request("/auth/register", account);
  assert.equal(result.response.status, 201);
  assert.equal(result.body.farmer.username, account.username);
  assert.equal(result.body.farmer.password_hash, undefined);
  assert.equal(result.body.token, undefined);
  const stored = (
    await pool.query("SELECT password_hash FROM farmer WHERE username=$1", [
      account.username,
    ])
  ).rows[0].password_hash;
  assert.notEqual(stored, account.password);
  assert.equal(await bcrypt.compare(account.password, stored), true);
  assert.equal(
    (
      await request("/auth/register", {
        ...account,
        username: "TEST.FARMER",
        email: "other@example.invalid",
      })
    ).response.status,
    409,
  );
  assert.equal(
    (
      await request("/auth/register", {
        ...account,
        username: "other",
        email: "FARMER@example.invalid",
      })
    ).response.status,
    409,
  );
});
test("login, session restoration, protected APIs and CORS share the persisted JWT contract", async () => {
  assert.equal(
    (
      await request("/auth/login", {
        username: account.username,
        password: "incorrect",
      })
    ).response.status,
    401,
  );
  assert.equal((await request("/auth/session")).response.status, 401);
  assert.equal((await request("/farmers")).response.status, 401);
  const token = await login("TEST.FARMER");
  const session = await request("/auth/session", undefined, token);
  assert.equal(session.response.status, 200);
  assert.equal(session.body.farmer.username, account.username);
  assert.equal(session.body.farmer.password_hash, undefined);
  assert.equal(session.response.headers.get("cache-control"), "no-store");
  assert.equal(
    (await request("/farmers", undefined, token)).response.status,
    200,
  );
  const stored = await pool.query("SELECT token_hash FROM farmer_session");
  assert.ok(stored.rows.length > 0);
  assert.equal(
    stored.rows.some((row) => row.token_hash === token),
    false,
  );
  for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
    const response = await fetch(`${base}/api/auth/session`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
      },
    });
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.match(
      response.headers.get("access-control-allow-headers"),
      /authorization/i,
    );
  }
});
test("logout revokes that JWT; expired, forged and old untracked tokens cannot authenticate", async () => {
  const first = await login(),
    second = await login();
  assert.notEqual(first, second);
  assert.equal((await request("/auth/logout", {}, first)).response.status, 200);
  assert.equal(
    (await request("/auth/session", undefined, first)).response.status,
    401,
  );
  assert.equal(
    (await request("/auth/session", undefined, second)).response.status,
    200,
  );
  await pool.query(
    "UPDATE farmer_session SET expires_at = NOW() - INTERVAL '1 second'",
  );
  assert.equal(
    (await request("/auth/session", undefined, second)).response.status,
    401,
  );
  assert.equal(
    (await request("/auth/session", undefined, "not-a-jwt")).response.status,
    401,
  );
  const old = jwt.sign({ id: 3, username: account.username }, secret);
  assert.equal(
    (await request("/auth/session", undefined, old)).response.status,
    401,
  );
});
test("existing bcrypt and scrypt accounts work; plaintext credentials are never accepted", async () => {
  await login("farmer_2");
  assert.equal(
    (
      await request("/auth/login", {
        username: "farmer_1",
        password: "legacy-plaintext-must-not-authenticate",
      })
    ).response.status,
    401,
  );
  const salt = "0".repeat(32);
  const hash = `scrypt$${salt}$${scryptSync(account.password, salt, 64).toString("hex")}`;
  await pool.query(
    "INSERT INTO farmer(full_name,username,email,password_hash,phone_number) VALUES ('Scrypt','previous.account','previous@example.invalid',$1,'123456789')",
    [hash],
  );
  await login("previous.account");
});
test("password recovery cannot disclose an OTP or modify a password without real delivery", async () => {
  for (const endpoint of ["/auth/forgot-password", "/auth/reset-password"]) {
    const result = await request(endpoint, {
      email: account.email,
      otp: "123456",
      new_password: "attacker-password",
    });
    assert.equal(result.response.status, 503);
    assert.equal(result.body.demo_otp, undefined);
  }
  await login();
  assert.doesNotMatch(logs, /OTP|SIMULASI EMAIL/);
});
test("a session DB outage never reports successful login or logout or invalidates a good token", async () => {
  const token = await login();
  await pool.query("ALTER TABLE farmer_session RENAME TO session_unavailable");
  try {
    assert.equal(
      (await request("/auth/session", undefined, token)).response.status,
      503,
    );
    assert.equal(
      (await request("/auth/logout", {}, token)).response.status,
      503,
    );
    assert.equal(
      (
        await request("/auth/login", {
          username: account.username,
          password: account.password,
        })
      ).response.status,
      503,
    );
  } finally {
    await pool.query(
      "ALTER TABLE session_unavailable RENAME TO farmer_session",
    );
  }
  assert.equal(
    (await request("/auth/session", undefined, token)).response.status,
    200,
  );
});
