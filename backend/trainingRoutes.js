const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { route, fail } = require("./apiHelpers");
const { createClient } = require("@supabase/supabase-js");

function createTrainingRoutes(pool, authenticate) {
  const router = Router();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

  // 1. ENDPOINT HISTORY TRAINING
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
      let currentAccuracy = null;
      let lastRetrained = null;

      if (supabase) {
        const { data } = await supabase.from('ai_status').select('*').eq('id', 1).single();
        if (data) {
          cloudStatus = data.status;
          currentAccuracy = data.accuracy;
          lastRetrained = data.last_retrained;
        }
      }

      res.json({
        totalCorrections: corrections.rows[0].count,
        pendingTraining: pending.rows[0].count,
        evaluations: [],
        currentAccuracy: (currentAccuracy !== null && currentAccuracy !== undefined) ? `${Number(currentAccuracy).toFixed(2)}%` : 'Unavailable',
        accuracyHistory: [], 
        lastRetrained: lastRetrained ? new Date(lastRetrained).toLocaleDateString() : 'Not yet retrained',
        retraining_available: true,
        worker: { status: cloudStatus }, 
        weekly_schedule: null,
        evaluation_note: "Training is securely handled via GitHub Actions & Supabase Storage.",
      });
    })
  );

  // 2. ENDPOINT POLLING (Progress Bar)
  router.get(
    "/analytics/retrain-status",
    authenticate,
    route(async (_req, res) => {
      if (!supabase) return fail(503, "Supabase not configured");
      const { data } = await supabase.from('ai_status').select('*').eq('id', 1).single();
      res.json(data || { status: 'idle' });
    })
  );

  // 3. ENDPOINT BUTANG RETRAIN (Trigger GitHub Actions)
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

      // 1. Update status di Supabase
      const { error } = await supabase
        .from('ai_status')
        .update({ 
          status: 'requested', 
          message: 'Menghantar arahan ke GitHub Actions...', // Mesej baru
          progress: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);

      if (error) return fail(500, "Gagal update Supabase: " + error.message);

            // 2. Tembak API GitHub Actions
      try {
        const GITHUB_REPO = "NotApel/Duri.AI"; 
        
        const ghRes = await fetch(
          `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/retrain-ai.yml/dispatches`,
          {
            method: "POST",
            headers: {
              "Accept": "application/vnd.github+json",
              "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "DuriAI-Backend"
            },
            body: JSON.stringify({ ref: "main" }) 
          }
        );

        if (!ghRes.ok) {
          // Ambil mesej error sebenar dari GitHub untuk log
          const errorData = await ghRes.json().catch(() => ({}));
          console.error("GitHub Response:", ghRes.status, errorData);
          throw new Error(`GitHub API error: ${ghRes.status} - ${errorData.message || 'Unknown'}`);
        }

        res.status(202).json({ message: "Arahan berjaya dihantar ke GitHub Actions!" });
      } catch (err) {
        console.error("GitHub Trigger Error:", err.message);
        // Kalau GitHub gagal, reset status supaya user boleh try lagi
        await supabase.from('ai_status').update({ status: 'failed', message: 'Gagal trigger GitHub Actions.' }).eq('id', 1);
        return fail(500, "Gagal trigger GitHub Actions: " + err.message);
      }
  return router;
}

module.exports = { createTrainingRoutes };