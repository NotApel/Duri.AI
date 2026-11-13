// Read-only preflight: no migrations, seeds, test events, emails or push sends.
require("dotenv").config({
  path: require("node:path").join(__dirname, "../.env"),
});
const { deploymentProblems } = require("../deploymentConfig");
async function main() {
  const problems = deploymentProblems();
  if (problems.length) {
    for (const problem of problems) console.error("NOT READY:", problem);
    process.exitCode = 1;
    return;
  }
  const pool = require("../db");
  try {
    const required = [
      "farmer",
      "farmer_session",
      "farmer_password_reset",
      "farm_plot",
      "sensor_node",
      "sensor_reading",
      "detection",
      "detection_image",
      "detection_feedback",
      "feedback_category",
      "notification",
      "training_queue",
      "device_gateway",
      "gateway_node",
      "gateway_event",
      "push_subscription",
      "push_delivery",
    ];
    const tables = await pool.query(
      "SELECT name,to_regclass(name) AS relation FROM unnest($1::text[]) AS name",
      [required],
    );
    if (tables.rows.some((row) => !row.relation))
      throw new Error("SCHEMA_MISSING");
    const batteryColumn = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sensor_node' AND column_name='battery_recorded_at'",
    );
    if (!batteryColumn.rows.length)
      throw new Error("BATTERY_MIGRATION_MISSING");
    const categories = await pool.query(
      "SELECT count(*)::int AS n FROM feedback_category",
    );
    if (!categories.rows[0].n) throw new Error("CATEGORIES_MISSING");
    const policies = await pool.query(
      "SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[]) LIMIT 1",
      [required],
    );
    if (policies.rows.length)
      console.warn(
        "REVIEW: Existing application-table RLS policies need a deliberate Supabase Data API access review.",
      );
    await require("../storage").createStorage().check();
    await require("../resetMailer").createResetMailer().verify();
    console.log(
      "PASS: production configuration, database schema/categories, private image bucket and SMTP connection.",
    );
    console.log(
      "Still verify real-device push, camera/inference, backups and restore before launch. No test message was sent.",
    );
  } catch (error) {
    console.error(
      "NOT READY: dependency verification failed:",
      /^[A-Z0-9_]+$/.test(error.code || error.message)
        ? error.code || error.message
        : "DEPENDENCY_CHECK_FAILED",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error("NOT READY: preflight could not run.");
  process.exitCode = 1;
});
