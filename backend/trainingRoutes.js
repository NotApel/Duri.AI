const { Router } = require("express");
const { spawn } = require("node:child_process");
const { access } = require("node:fs/promises");
const { constants } = require("node:fs");
const { route, fail } = require("./apiHelpers");
function createTrainingRoutes(pool, authenticate) {
  const router = Router();
  // Process-local worker state is not model evaluation or deployment evidence.
  let state = {
    status: "idle",
    error: "",
    started_at: null,
    finished_at: null,
  };
  let activeRun = null;
  const configured = Boolean(
    process.env.PYTHON_PATH && process.env.RETRAIN_SCRIPT_PATH,
  );
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
        evaluation_note:
          "No model evaluation records are available. Running the training script does not verify model accuracy or device deployment.",
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
    route(async (_req, res) => {
      if (!configured)
        fail(
          503,
          "Retraining is unavailable. Configure PYTHON_PATH and RETRAIN_SCRIPT_PATH on the backend.",
        );
      if (state.status === "processing")
        fail(409, "Retraining is already in progress.");
      // Claim before asynchronous checks to prevent simultaneous workers.
      state = {
        status: "processing",
        error: "",
        started_at: new Date().toISOString(),
        finished_at: null,
      };
      const run = {};
      activeRun = run;
      try {
        await access(process.env.PYTHON_PATH, constants.X_OK);
        await access(process.env.RETRAIN_SCRIPT_PATH, constants.R_OK);
        const child = spawn(
          process.env.PYTHON_PATH,
          [process.env.RETRAIN_SCRIPT_PATH],
          { shell: false, stdio: "ignore" },
        );
        const finish = (status, error = "") => {
          if (activeRun !== run) return;
          activeRun = null;
          state = {
            ...state,
            status,
            error,
            finished_at: new Date().toISOString(),
          };
        };
        child.once("error", () =>
          finish(
            "failed",
            "The training process could not start. Check the backend configuration.",
          ),
        );
        child.once("close", (code) => {
          if (state.status !== "processing") return;
          finish(
            code === 0 ? "success" : "failed",
            code === 0 ? "" : "The training script failed. Check backend logs.",
          );
        });
        res.status(202).json({
          message:
            "Training script started. Evaluation and deployment remain unverified.",
        });
      } catch {
        activeRun = null;
        state = {
          ...state,
          status: "failed",
          error: "The configured training executable or script is unavailable.",
          finished_at: new Date().toISOString(),
        };
        fail(503, state.error);
      }
    }),
  );
  return router;
}
module.exports = { createTrainingRoutes };
