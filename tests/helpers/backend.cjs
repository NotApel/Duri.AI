// Disposable full-schema backend for integration/browser tests. Never uses DB_NAME.
const { Pool } = require("../../backend/node_modules/pg");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { readFile } = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
async function waitReady(url, logs) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start: ${logs()}`);
}
async function backendFixture(env = {}) {
  const config = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
  };
  const database = `duri_priorities_${process.pid}_${Date.now()}`;
  const admin = new Pool({ ...config, database: "postgres" });
  const pool = new Pool({ ...config, database });
  let child,
    created = false,
    output = "";
  async function close() {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await pool.end();
    if (created) await admin.query(`DROP DATABASE ${database}`);
    await admin.end();
  }
  try {
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
    // Exercise upgrading the original farm constraints rather than only fresh schemas.
    await pool.query(
      "ALTER TABLE farm_plot ALTER COLUMN latitude SET NOT NULL; ALTER TABLE farm_plot ALTER COLUMN longitude SET NOT NULL",
    );
    const port = await freePort();
    const base = `http://127.0.0.1:${port}/api`;
    child = spawn(process.execPath, ["app.js"], {
      cwd: path.join(root, "backend"),
      env: {
        ...process.env,
        DB_HOST: config.host,
        DB_PORT: String(config.port),
        DB_USER: config.user,
        DB_PASSWORD: config.password,
        DB_NAME: database,
        PORT: String(port),
        JWT_SECRET: "test-only-priorities-auth-secret",
        DEVICE_API_KEY: "test-only-priorities-device-key",
        SMTP_HOST: "",
        SMTP_FROM: "",
        PYTHON_PATH: "",
        RETRAIN_SCRIPT_PATH: "",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    await waitReady(`${base}/health`, () => output);
    async function request(
      endpoint,
      { method = "GET", body, token, device = false } = {},
    ) {
      const response = await fetch(`${base}${endpoint}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(device ? { "x-api-key": "test-only-priorities-device-key" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    async function account(username) {
      const body = {
        username,
        password: "test-password-2026",
        email: `${username}@example.invalid`,
        full_name: "Test Farmer",
        phone_number: "+60123456789",
      };
      const registered = await request("/auth/register", {
        method: "POST",
        body,
      });
      if (registered.status !== 201)
        throw new Error(JSON.stringify(registered));
      const login = await request("/auth/login", {
        method: "POST",
        body: { username, password: body.password },
      });
      return {
        ...registered.body.farmer,
        token: login.body.token,
        username,
        password: body.password,
      };
    }
    return { pool, request, account, base, close, root };
  } catch (error) {
    await close();
    throw error;
  }
}
module.exports = { backendFixture, freePort, waitReady };
