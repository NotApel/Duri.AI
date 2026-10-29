const { readFileSync } = require("node:fs");
function databaseConfig(env = process.env) {
  const max = Number(env.DB_POOL_MAX || 5);
  if (!Number.isInteger(max) || max < 1 || max > 20)
    throw new Error("DB_POOL_MAX must be between 1 and 20.");
  let connectionString;
  if (env.DATABASE_URL) {
    let url;
    try {
      url = new URL(env.DATABASE_URL);
    } catch {
      throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
    }
    if (!["postgres:", "postgresql:"].includes(url.protocol))
      throw new Error("DATABASE_URL must use PostgreSQL.");
    // Keep node-postgres URL SSL flags from overriding verified TLS configuration.
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
      url.searchParams.delete(key);
    connectionString = url.href;
  }
  if (env.DB_SSL && !["true", "false"].includes(env.DB_SSL))
    throw new Error("DB_SSL must be true or false.");
  const useTLS = env.DB_SSL ? env.DB_SSL === "true" : Boolean(connectionString);
  if (env.NODE_ENV === "production" && !useTLS)
    throw new Error(
      "Production PostgreSQL requires verified TLS; set DB_SSL=true.",
    );
  return {
    ...(connectionString
      ? { connectionString }
      : {
          host: env.DB_HOST || "localhost",
          port: Number(env.DB_PORT || 5432),
          database: env.DB_NAME || "duri_ai_db",
          user: env.DB_USER || "postgres",
          password: env.DB_PASSWORD,
        }),
    ssl: useTLS
      ? {
          rejectUnauthorized: true,
          ...(env.DB_SSL_CA_FILE
            ? { ca: readFileSync(env.DB_SSL_CA_FILE, "utf8") }
            : {}),
        }
      : false,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
  };
}
module.exports = { databaseConfig };
