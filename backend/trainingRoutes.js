const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { route, fail } = require("./apiHelpers");
const { createClient } = require("@supabase/supabase-js");

function createTrainingRoutes(pool, authenticate) {
  const router = Router();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Pastikan ni ada dalam .env Render
  const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

  // Trigger Cloud Training
  async function triggerCloudTraining() {
    if (!supabase) {
      throw new Error("Supabase is not configured on the backend.");
    }

    try {
      // 1. Semak status semasa di Supabase
      const { data: current } = await supabase.from('ai_status').select('status').eq('id', 1).single();
      
      if (current && (current.status === 'training' || current.status === 'requested')) {
        throw new Error("Retraining is already in progress.");
      }

      // 2. Update status ke 'requested' supaya Colab nampak
      const { error } = await supabase
        .from('ai_status')
        .update({ 
          status: 'requested', 
          message: 'Menunggu Google Colab ambil tugas...',
          progress: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);

      if (error) throw error;

      return { success: true };
    } catch (err) {
      console.error("Error triggering cloud training:", err);
      throw err;
    }
  }

  // Endpoint untuk dapatkan status terkini
  router.get(
    "/analytics/retrain-status",
    authenticate,
    route(async (_req, res) => {
      if (!supabase) return fail(503, "Supabase not configured");
      
      const { data, error } = await supabase.from('ai_status').select('*').eq('id', 1).single();
      if (error) return fail(500, "Gagal ambil status dari Supabase");
      
      res.json(data);
    })
  );

  // Endpoint butang "Retrain"
  const manualLimit = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 1 hari
    limit: 10,
    keyGenerator: (req) => req.farmer.id,
    message: { error: "Had retrain harian dah capai." },
  });

  router.post(
    "/analytics/retrain",
    authenticate,
    manualLimit,
    route(async (_req, res) => {
      await triggerCloudTraining();
      res.status(202).json({
        message: "Arahan retrain berjaya dihantar ke Google Colab!",
      });
    })
  );

  return router;
}

module.exports = { createTrainingRoutes };