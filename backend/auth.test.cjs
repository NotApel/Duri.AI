const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { Pool } = require("pg");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { createAuth, migrateAuth } = require("./auth");

const schema = `auth_test_${process.pid}_${Date.now()}`;
const config = {
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "duri_ai_db",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
};
const admin = new Pool(config);
const pool = new Pool({ ...config, options: `-c search_path=${schema}` });
let server,
  base,
  failLogout = false,
  failRegister = false,
  failLogin = false;
const account = {
  full_name: "Auth Test Farmer",
  username: "test.farmer",
  email: "farmer@example.invalid",
  password: "durian-test-2026",
  phone_number: "+60123456789",
};
const db = {
  query(sql, params) {
    if (
      failLogout &&
      sql.startsWith("DELETE FROM farmer_session WHERE token_hash")
    )
      throw new Error("Test database outage");
    if (failRegister && sql.includes("INSERT INTO farmer ("))
      throw new Error("Test database outage");
    return pool.query(sql, params);
  },
  async connect() {
    const client = await pool.connect();
    return {
      query(sql, params) {
        if (failLogin && sql.startsWith("INSERT INTO farmer_session"))
          throw new Error("Test database outage");
        return client.query(sql, params);
      },
      release() {
        client.release();
      },
    };
  },
};
async function request(route, body, cookie) {
  const response = await fetch(base + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    response,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(
    await readFile(path.join(__dirname, "../database/farmer.sql"), "utf8"),
  );
  await migrateAuth(pool);
  await migrateAuth(pool);
  const app = express();
  app.use(express.json());
  const auth = createAuth(db);
  app.use("/auth", auth.router);
  app.get("/private", auth.requireSession, (req, res) =>
    res.json({ farmer: req.farmer }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
});
test("registration validates all required fields, email, username and password without creating records", async () => {
  for (const body of [
    {},
    { ...account, password: "short" },
    { ...account, email: "invalid" },
    { ...account, username: "a b" },
    { ...account, full_name: "   " },
    { ...account, phone_number: "bad" },
  ])
    assert.equal((await request("/auth/register", body)).response.status, 400);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM farmer")).rows[0]
      .count,
    0,
  );
});
test("registration stores a hash, creates no session, and rejects duplicate username/email case-insensitively", async () => {
  const result = await request("/auth/register", account);
  assert.equal(result.response.status, 201);
  assert.equal(result.cookie, undefined);
  assert.equal(result.body.farmer.username, account.username);
  assert.equal(result.body.farmer.password_hash, undefined);
  const stored = (await pool.query("SELECT password_hash FROM farmer")).rows[0]
    .password_hash;
  assert.match(stored, /^scrypt\$/);
  assert.notEqual(stored, account.password);
  assert.equal((await request("/auth/session")).response.status, 401);
  const username = await request("/auth/register", {
    ...account,
    username: account.username.toUpperCase(),
    email: "different@example.invalid",
  });
  assert.equal(username.response.status, 409);
  assert.match(username.body.error, /Username/);
  const email = await request("/auth/register", {
    ...account,
    username: "different",
    email: account.email.toUpperCase(),
  });
  assert.equal(email.response.status, 409);
  assert.match(email.body.error, /Email/);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM farmer")).rows[0]
      .count,
    1,
  );
});
test("incorrect or nonexistent usernames create no session and return the same credentials error", async () => {
  const wrong = await request("/auth/login", {
    username: account.username,
    password: "wrong",
  });
  const missing = await request("/auth/login", {
    username: "missing",
    password: account.password,
  });
  assert.equal(wrong.response.status, 401);
  assert.equal(missing.response.status, 401);
  assert.deepEqual(wrong.body, missing.body);
  assert.equal(wrong.cookie, undefined);
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM farmer_session"))
      .rows[0].count,
    0,
  );
});
test("successful login creates a cookie/session, survives another request, rotates and revokes on logout", async () => {
  const first = await request("/auth/login", {
    username: account.username.toUpperCase(),
    password: account.password,
  });
  assert.equal(first.response.status, 200);
  assert.match(first.response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(first.response.headers.get("set-cookie"), /SameSite=Lax/);
  assert.equal(first.body.farmer.password_hash, undefined);
  const stored = (await pool.query("SELECT token_hash FROM farmer_session"))
    .rows[0].token_hash;
  assert.notEqual(stored, first.cookie.split("=")[1]);
  assert.equal(
    (await request("/auth/session", undefined, first.cookie)).response.status,
    200,
  );
  const second = await request(
    "/auth/login",
    { username: account.username, password: account.password },
    first.cookie,
  );
  assert.notEqual(first.cookie, second.cookie);
  assert.equal(
    (await request("/private", undefined, first.cookie)).response.status,
    401,
  );
  assert.equal(
    (await request("/private", undefined, second.cookie)).response.status,
    200,
  );
  assert.equal(
    (await request("/auth/logout", {}, second.cookie)).response.status,
    200,
  );
  assert.equal(
    (await request("/private", undefined, second.cookie)).response.status,
    401,
  );
});
test("failed logout keeps the server session and does not clear the cookie", async () => {
  const login = await request("/auth/login", {
    username: account.username,
    password: account.password,
  });
  failLogout = true;
  try {
    const result = await request("/auth/logout", {}, login.cookie);
    assert.equal(result.response.status, 503);
    assert.equal(result.cookie, undefined);
  } finally {
    failLogout = false;
  }
  assert.equal(
    (await request("/auth/session", undefined, login.cookie)).response.status,
    200,
  );
  await request("/auth/logout", {}, login.cookie);
});
test("expired sessions cannot access protected data", async () => {
  const login = await request("/auth/login", {
    username: account.username,
    password: account.password,
  });
  await pool.query(
    "UPDATE farmer_session SET expires_at = NOW() - INTERVAL '1 second'",
  );
  assert.equal(
    (await request("/auth/session", undefined, login.cookie)).response.status,
    401,
  );
});
test("database errors do not create accounts or partially replace an existing session", async () => {
  failRegister = true;
  try {
    assert.equal(
      (
        await request("/auth/register", {
          ...account,
          username: "outage",
          email: "outage@example.invalid",
        })
      ).response.status,
      503,
    );
  } finally {
    failRegister = false;
  }
  assert.equal(
    (await pool.query("SELECT count(*)::int AS count FROM farmer")).rows[0]
      .count,
    1,
  );
  const login = await request("/auth/login", {
    username: account.username,
    password: account.password,
  });
  failLogin = true;
  try {
    const result = await request(
      "/auth/login",
      { username: account.username, password: account.password },
      login.cookie,
    );
    assert.equal(result.response.status, 503);
    assert.equal(result.cookie, undefined);
  } finally {
    failLogin = false;
  }
  assert.equal(
    (await request("/auth/session", undefined, login.cookie)).response.status,
    200,
  );
});
