const { databaseConfig } = require("./databaseConfig");
const { createStorage } = require("./storage");
const { createResetMailer } = require("./resetMailer");
const { pushConfig } = require("./push");
const { legacyDevicesEnabled } = require("./deviceAuth");
function deploymentProblems(env = process.env) {
  const problems = [];
  if (env.NODE_ENV !== "production")
    problems.push("Set NODE_ENV=production for the deployment check.");
  if (
    Buffer.byteLength(env.JWT_SECRET || "") < 32 ||
    /replace|example|test-only|changeme/i.test(env.JWT_SECRET || "")
  )
    problems.push("Configure a strong JWT_SECRET of at least 32 bytes.");
  try {
    const config = databaseConfig(env);
    if (!config.ssl || !config.ssl.rejectUnauthorized) throw new Error();
    if (
      !env.DATABASE_URL &&
      ![env.DB_HOST, env.DB_NAME, env.DB_USER, env.DB_PASSWORD].every(Boolean)
    )
      throw new Error();
  } catch {
    problems.push(
      "Configure the production PostgreSQL connection with verified TLS and a trusted CA when required.",
    );
  }
  try {
    const origins = (env.FRONTEND_ORIGINS || "")
      .split(",")
      .map((s) => s.trim());
    for (const origin of [...origins, env.FRONTEND_URL]) {
      const url = new URL(origin);
      if (
        url.protocol !== "https:" ||
        url.origin !== origin ||
        url.hostname.includes("*") ||
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
        throw new Error();
    }
    if (!origins.includes(env.FRONTEND_URL)) throw new Error();
  } catch {
    problems.push(
      "Set exact HTTPS FRONTEND_ORIGINS and a matching production FRONTEND_URL.",
    );
  }
  try {
    if (!createStorage(env).configured) throw new Error();
  } catch {
    problems.push(
      "Configure private Supabase Storage using backend-only credentials.",
    );
  }
  try {
    if (!pushConfig(env).enabled) throw new Error();
  } catch {
    problems.push(
      "Enable Web Push with PUSH_ENABLED=true and valid VAPID settings.",
    );
  }
  if (!createResetMailer(env))
    problems.push(
      "Configure SMTP and the trusted frontend URL for password recovery.",
    );
  try {
    if (legacyDevicesEnabled(env)) throw new Error();
  } catch {
    problems.push(
      "Disable shared-key legacy writes with LEGACY_DEVICE_ROUTES_ENABLED=false.",
    );
  }
  return problems;
}
module.exports = { deploymentProblems };
