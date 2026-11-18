const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { route, fail } = require("./apiHelpers");
const { createClient } = require("@supabase/supabase-js");

function createTrainingRoutes(pool, authenticate) {
  const router = Router();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

  // 1. ENDPOINT ASAL KAU (Untuk tarik data history training)
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
      
      let cloudStatus = "idle";
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
        worker: { status: cloudStatus }, 
        weekly_schedule: null,
        evaluation_note: "Training is securely handled via Google Colab & Supabase Storage.",
      });
    }),
  );

  // 2. ENDPOINT POLLING (Untuk update progress bar di frontend)
  router.get(
    "/analytics/retrain-status",
    authenticate,
    route(async (_req, res) => {
      if (!supabase) return fail(503, "Supabase not configured");
      const { data } = await supabase.from('ai_status').select('*').eq('id', 1).single();
      res.json(data || { status: 'idle' });
    })
  );

  // 3. ENDPOINT BUTANG RETRAIN (Untuk trigger Google Colab)
  const manualLimit = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => req.farmer.id,
    message: { error: "Had retrain harian dah capai." },
  });

  router.post(
    "/analytics/retrain",
    authenticate,
    manualLimit,
    route(async (req, res) => {
      if (!supabase) return fail(503, "Supabase not configured");

      const { data: current } = await supabase.from('ai_status').select('status').eq('id', 1).single();
      if (current && (current.status === 'requested' || current.status === 'training')) {
        return fail(409, "Retraining sedang berjalan atau sudah di-request.");
      }

      const { error } = await supabase
        .from('ai_status')
        .update({ 
          status: 'requested', 
          message: 'Menunggu Colab ambil tugas...',
          progress: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);

      if (error) return fail(500, "Gagal update Supabase: " + error.message);

      res.status(202).json({ message: "Arahan dihantar ke Colab!" });
    })
  );

  return router;
}

module.exports = { createTrainingRoutes };