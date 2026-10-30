const { Pool } = require("pg");
require("dotenv").config();
const { databaseConfig } = require("./databaseConfig");
const pool = new Pool(databaseConfig());
pool.on("error", (error) =>
  console.error("PostgreSQL pool error:", error.code || "CONNECTION_ERROR"),
);
module.exports = pool;
