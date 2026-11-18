const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { route, fail } = require("./apiHelpers");
const { createClient } = require("@supabase/supabase-js");

function createTrainingRoutes(pool, authenticate) {
  const router = Router();

  // Connect to Supabase for Google Colab worker status syncing
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

  let state = {
    status: "idle",
    error: "",
    started_at: null,
    finished_at: null,
  };

  // Lightweight function: Send training trigger to Supabase (No Render RAM used for Python)
  async function triggerCloudTraining() {
    if (!supabase) {
      fail(503, "Supabase is not configured on the backend.");
    }

    if (state.status === "processing") {
      fail(409, "Retraining is already in progress.");
    }

    state = {
      status: "processing",
      error: "",
      started_at: new Date().toISOString(),
      finished_at: null,
    };

    try {
      // Update status in Supabase so Google Colab worker can pick it up
      const { error } = await supabase
        .from('ai_status')
        .update({ status: 'training', updated_at: new Date() })
        .eq('id', 1);

      if (error) throw error;

      // Temporary local success state (Google Colab will update it back when finished)
      state.status = "success";
      state.finished_at = new Date().toISOString();

    } catch (err) {
      console.error("Error triggering cloud training:", err);
      state = {
        ...state,
        status: "failed",
        error: "Failed to send training trigger to the cloud.",
        finished_at: new Date().toISOString(),
      };
      fail(500, state.error);
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
      error: "Daily manual retraining limit has been reached.",
    },
  });

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
      
      // Fetch latest cloud status from Supabase if available
      let cloudStatus = state.status;
      if (supabase) {
        const { data } = await supabase.from('ai_status').select('status').eq('id', 1).single();
        if (data) cloudStatus = data.status;
      }

      res.json({
        totalCorrections: corrections.rows[0].count,
        pendingTraining: pending.rows[0].count,
        evaluations: [],
        currentAccuracy: null,
        accuracyHistory: [],
        lastRetrained: null,
        retraining_available: true,
        worker: { ...state, status: cloudStatus },
        weekly_schedule: null,
        evaluation_note: "Training is securely handled via Google Colab & Supabase Storage.",
      });
    }),
  );

  router.get(
    "/analytics/retrain-status",
    authenticate,
    route(async (_req, res) => {
      let cloudStatus = state.status;
      if (supabase) {
        const { data } = await supabase.from('ai_status').select('status').eq('id', 1).single();
        if (data) cloudStatus = data.status;
      }
      res.json({ ...state, status: cloudStatus });
    }),
  );

  router.post(
    "/analytics/retrain",
    authenticate,
    manualLimit,
    route(async (_req, res) => {
      await triggerCloudTraining();
      res.status(202).json({
        message: "Training trigger successfully sent to Google Colab Worker via Supabase!",
      });
    }),
  );

  return router;
}

module.exports = { createTrainingRoutes };