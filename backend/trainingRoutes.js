const { Router } = require("express");
const { spawn } = require("node:child_process");
const { access } = require("node:fs/promises");
const { constants } = require("node:fs");
const cron = require("node-cron");
const rateLimit = require("express-rate-limit");
const { route, fail } = require("./apiHelpers");
function createTrainingRoutes(pool, authenticate) {
  const router = Router();
  let state = {
      status: "idle",
      error: "",
      started_at: null,
      finished_at: null,
    },
    activeRun = null;
  const configured = Boolean(
    process.env.PYTHON_PATH && process.env.RETRAIN_SCRIPT_PATH,
  );
  async function run() {
    if (!configured)
      fail(
        503,
        "Retraining is unavailable. Configure PYTHON_PATH and RETRAIN_SCRIPT_PATH on the backend.",
      );
    if (state.status === "processing")
      fail(409, "Retraining is already in progress.");
    
    state = {
      status: "processing",
      error: "",
      started_at: new Date().toISOString(),
      finished_at: null,
    };
    
    const runId = {};
    activeRun = runId;
    
    const finish = (status, error = "") => {
      if (activeRun !== runId) return;
      activeRun = null;
      state = {
        ...state,
        status,
        error,
        finished_at: new Date().toISOString(),
      };
    };

    try {
      // Kita semak skrip python sahaja, biarkan python3 berjalan terus secara global
      await access(process.env.RETRAIN_SCRIPT_PATH, constants.R_OK);
      
      const child = spawn(
        process.env.PYTHON_PATH || "python3",
        [process.env.RETRAIN_SCRIPT_PATH],
        { shell: false, stdio: "pipe" }, // Ubah dari 'ignore' ke 'pipe' supaya kita boleh baca ralatnya
      );

      // Tangkap apa sahaja mesej ralat dari skrip Python
      child.stderr.on("data", (data) => {
        console.error(`PYTHON ERROR: ${data.toString()}`);
      });

      child.stdout.on("data", (data) => {
        console.log(`PYTHON OUTPUT: ${data.toString()}`);
      });

      child.once("error", (err) => {
        console.error("Process spawn failed:", err);
        finish("failed", "The training process could not start.");
      });
      
      child.once("close", (code) => {
        console.log(`Python process exited with code ${code}`);
        finish(
          code === 0 ? "success" : "failed",
          code === 0 ? "" : "The training script failed."
        );
      });
    } catch (err) {
      console.error("Access check error:", err);
      finish(
        "failed",
        "The configured training executable or script is unavailable.",
      );
      fail(503, state.error);
    }
  }
  const manualLimit = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => req.farmer.id,
    skipFailedRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error:
        "Manual retraining limit reached for today. Weekly retraining remains scheduled when configured.",
    },
  });
  const schedule = process.env.AUTO_RETRAIN_CRON || "0 2 * * 0";
  let scheduled;
  if (configured && process.env.AUTO_RETRAIN_ENABLED !== "false") {
    if (!cron.validate(schedule))
      throw new Error("AUTO_RETRAIN_CRON is not a valid cron expression.");
    scheduled = cron.schedule(
      schedule,
      () =>
        run().catch((error) =>
          console.error(
            "Scheduled training skipped:",
            error.status || "WORKER_ERROR",
          ),
        ),
      { timezone: "Asia/Kuala_Lumpur" },
    );
  }
  router.stopScheduledTask = () => scheduled?.stop();
  router.get(
    "/analytics/training",
    authenticate,
    route(async (req, res) => {
      const corrections = await pool.query(
        "SELECT count(*)::int AS count FROM detection_feedback WHERE farmer_id=$1",
        [req.farmer.id],
      );
      const pending = await pool.query(
        "SELECT count(*)::int AS count FROM training_queue tq JOIN detection_feedback df ON df.feedback_id=tq.feedback_id WHERE df.farmer_id=$1 AND tq.queue_status='PENDING'",
        [req.farmer.id],
      );
      res.json({
        totalCorrections: corrections.rows[0].count,
        pendingTraining: pending.rows[0].count,
        evaluations: [],
        currentAccuracy: null,
        accuracyHistory: [],
        lastRetrained: null,
        retraining_available: configured,
        worker: { ...state },
        weekly_schedule: scheduled
          ? { cron: schedule, timezone: "Asia/Kuala_Lumpur" }
          : null,
        evaluation_note:
          "No model evaluation records are available. Script completion does not verify accuracy or deployment.",
      });
    }),
  );
  router.get(
    "/analytics/retrain-status",
    authenticate,
    route(async (_req, res) => res.json({ ...state })),
  );
  router.post(
    "/analytics/retrain",
    authenticate,
    manualLimit,
    route(async (_req, res) => {
      await run();
      res.status(202).json({
        message:
          "Training script started. Evaluation and deployment remain unverified.",
      });
    }),
  );
  return router;
}
module.exports = { createTrainingRoutes };
