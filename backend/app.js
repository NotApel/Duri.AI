// backend/app.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const rateLimit = require("express-rate-limit");
const { createAuth, migrateAuth } = require("./auth");

dotenv.config();
const app = express();

// YOUR FRIEND'S SECURE CORS & 50MB LIMIT (MERGED PERFECTLY)
const frontendOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map(origin => origin.trim()).filter(Boolean);
app.use(cors({ origin: frontendOrigins, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// Rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again after 15 minutes" },
});

// YOUR FRIEND'S ESP32 MIDDLEWARE
const deviceAuth = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.DEVICE_API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }
  next();
};

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "duri_ai_db",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
});

// CONNECT YOUR FRIEND'S SECURE AUTH SYSTEM (REPLACES THE 250 LINES OF DUPLICATE CODE)
const { router: authRouter, authenticate: auth } = createAuth(pool);
app.use("/api/auth", authRouter);

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({ status: "OK", message: "Duri.AI Backend is running! Database connected." });
  } catch (error) {
    res.status(500).json({ status: "ERROR", message: "Database connection failed" });
  }
});

// ============================================================
// FARMER & PLOT ENDPOINTS (YOURS + AUTH)
// ============================================================
app.get("/api/farmers", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT farmer_id, full_name, username, email, phone_number, created_at, updated_at FROM farmer ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch farmers" }); }
});

app.get("/api/farmers/:id", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT farmer_id, full_name, username, email, phone_number, created_at, updated_at FROM farmer WHERE farmer_id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Farmer not found" });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: "Failed to fetch farmer" }); }
});

app.get("/api/farmers/:farmerId/plots", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM farm_plot WHERE farmer_id = $1 ORDER BY plot_name", [req.params.farmerId]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch plots" }); }
});

app.post("/api/farmers/:farmerId/plots", auth, async (req, res) => {
  try {
    const { farm_name, plot_name, plot_size, latitude, longitude } = req.body;
    if (!farm_name || !plot_name || !latitude || !longitude) {
      return res.status(400).json({ error: "Farm name, plot name, latitude, and longitude are required" });
    }
    const result = await pool.query(
      `INSERT INTO farm_plot (farmer_id, farm_name, plot_name, plot_size, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.farmerId, farm_name, plot_name, plot_size || null, latitude, longitude]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: "Failed to create plot" }); }
});

app.get("/api/plots/:plotId/nodes", auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sensor_node WHERE plot_id = $1 ORDER BY node_name", [req.params.plotId]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch nodes" }); }
});

// ============================================================
// DETECTIONS & FEEDBACK (YOURS + AUTH)
// ============================================================
app.get("/api/detections", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, sn.node_name,
         COALESCE(json_agg(json_build_object('image_id', di.image_id, 'image_path', di.image_path, 'sequence_number', di.sequence_number, 'is_selected', di.is_selected)) FILTER (WHERE di.image_id IS NOT NULL), '[]') AS images
       FROM detection d
       JOIN sensor_reading sr ON d.reading_id = sr.reading_id
       JOIN sensor_node sn ON sr.node_id = sn.node_id
       LEFT JOIN detection_image di ON d.detection_id = di.detection_id
       GROUP BY d.detection_id, sn.node_name
       ORDER BY d.detection_at DESC LIMIT 10`
    );
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch detections" }); }
});

app.post("/api/detections", auth, async (req, res) => {
  try {
    let { reading_id, prediction, confidence, verify_required, detection_status } = req.body;
    if (!reading_id || !prediction || confidence === undefined) return res.status(400).json({ error: "Missing required fields" });

    prediction = prediction.toUpperCase();
    detection_status = detection_status ? detection_status.toUpperCase() : "PENDING";

    const result = await pool.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [reading_id, prediction, confidence, verify_required || false, detection_status]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: "Failed to create detection" }); }
});

app.get(["/api/detection/:detectionId/detection-image", "/api/detections/:detectionId/images"], auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM detection_image WHERE detection_id = $1 ORDER BY sequence_number ASC", [req.params.detectionId]);
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch images" }); }
});

app.get(["/api/feedback-category", "/api/feedback-categories"], auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM feedback_category ORDER BY category_id ASC");
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch feedback categories" }); }
});

app.post(["/api/detection/:detectionId/detection-feedback", "/api/detections/:detectionId/feedback"], auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { detectionId } = req.params;
    const { farmer_id, category_id, correct_detection, comment_farmer, image_base64 } = req.body;

    if (!farmer_id || correct_detection === undefined) return res.status(400).json({ error: "Farmer ID and correct_detection are required" });

    const feedbackResult = await client.query(
      `INSERT INTO detection_feedback (detection_id, farmer_id, category_id, correct_detection, comment_farmer) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [detectionId, farmer_id, category_id || null, correct_detection, comment_farmer || null]
    );

    const newStatus = correct_detection ? "VERIFIED" : "REJECTED";
    await client.query("UPDATE detection SET detection_status = $1 WHERE detection_id = $2", [newStatus, detectionId]);

    await client.query(`INSERT INTO training_queue (feedback_id, queue_status) VALUES ($1, 'PENDING')`, [feedbackResult.rows[0].feedback_id]);

    if (image_base64) {
      const dir = path.join(__dirname, "feedback_images");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(path.join(dir, `feedback_${detectionId}.jpg`), base64Data, "base64");
      console.log(`Saved feedback image for training.`);
    }

    await client.query("COMMIT");
    res.status(201).json(feedbackResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to submit feedback" });
  } finally {
    client.release();
  }
});

app.get(["/api/training-queue", "/api/training_queue"], auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM training_queue ORDER BY queue_at DESC LIMIT 20");
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch training queue" }); }
});

app.get(["/api/notification", "/api/notifications"], auth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM notification ORDER BY created_at DESC LIMIT 50");
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: "Failed to fetch notifications" }); }
});

// ============================================================
// ANALYTICS & YOUR AI RETRAINING BUTTON
// ============================================================
app.get("/api/analytics/stats", auth, async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM detection");
    const verified = await pool.query("SELECT COUNT(*) FROM detection WHERE detection_status = 'VERIFIED'");
    const rejected = await pool.query("SELECT COUNT(*) FROM detection WHERE detection_status = 'REJECTED'");
    const pending = await pool.query("SELECT COUNT(*) FROM detection WHERE detection_status = 'PENDING'");
    res.json({
      total: parseInt(total.rows[0].count, 10),
      verified: parseInt(verified.rows[0].count, 10),
      rejected: parseInt(rejected.rows[0].count, 10),
      pending: parseInt(pending.rows[0].count, 10),
    });
  } catch (error) { res.status(500).json({ error: "Failed to fetch stats" }); }
});

app.get("/api/analytics/training", auth, async (req, res) => {
  try {
    const corrections = await pool.query("SELECT COUNT(*) FROM detection_feedback");
    const pending = await pool.query("SELECT COUNT(*) FROM training_queue WHERE queue_status = 'PENDING'");
    const totalCorrections = parseInt(corrections.rows[0].count);

    res.json({
      totalCorrections: totalCorrections,
      pendingTraining: parseInt(pending.rows[0].count),
      farmerPoints: totalCorrections * 10,
      currentAccuracy: 99.93,
      lastRetrained: "2026-10-18 10:30 AM",
      accuracyHistory: [
        { week: "Week 1", accuracy: 85 },
        { week: "Week 2", accuracy: 92 },
        { week: "Week 3", accuracy: 99.93 },
      ],
    });
  } catch (error) { res.status(500).json({ error: "Failed to fetch training stats" }); }
});

app.post("/api/analytics/retrain", auth, (req, res) => {
  const pythonPath = "C:\\Users\\Acer\\DuriAI_TFLite\\tflite_env\\Scripts\\python.exe";
  const scriptPath = "C:\\Users\\Acer\\DuriAI_TFLite\\retrain_model.py";
  const command = `"${pythonPath}" "${scriptPath}"`;

  exec(command, { maxBuffer: 1024 * 1024 * 50, timeout: 600000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } }, (error, stdout, stderr) => {
    if (error) return res.status(500).json({ error: "Retraining failed", details: error.message, pythonError: stderr });
    res.json({ message: "Retraining successful" });
  });
});

// ============================================================
// YOUR FRIEND'S HARDWARE ENDPOINTS (100% INTACT)
// ============================================================
app.post("/api/sensor-readings", deviceAuth, async (req, res) => {
  try {
    const { node_id, amplitude, frequency, duration } = req.body;
    if (!node_id || amplitude === undefined || frequency === undefined) return res.status(400).json({ error: "Missing fields" });

    const result = await pool.query(
      `INSERT INTO sensor_reading (node_id, amplitude, frequency, duration, recorded_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [node_id, amplitude, frequency, duration || null]
    );
    res.status(201).json({ message: "Sensor reading saved", reading: result.rows[0] });
  } catch (error) { res.status(500).json({ error: "Failed to save sensor reading" }); }
});

app.post("/api/device/detections", deviceAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { node_id, prediction, confidence, image_base64 } = req.body;
    if (!node_id || !prediction || confidence === undefined) return res.status(400).json({ error: "Missing fields" });

    const readingQuery = await client.query(`SELECT reading_id FROM sensor_reading WHERE node_id = $1 ORDER BY recorded_at DESC LIMIT 1`, [node_id]);
    if (readingQuery.rows.length === 0) return res.status(400).json({ error: "No sensor reading found" });
    
    const reading_id = readingQuery.rows[0].reading_id;
    const detectionResult = await client.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status, detection_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [reading_id, prediction.toUpperCase(), confidence, false, 'PENDING']
    );
    const detection_id = detectionResult.rows[0].detection_id;

    if (image_base64) {
      await client.query(
        `INSERT INTO detection_image (detection_id, image_path, sequence_number, is_selected) VALUES ($1, $2, $3, $4)`,
        [detection_id, `/uploads/detection_${detection_id}.jpg`, 1, true]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ message: "Detection processed", detection: detectionResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Failed to process detection" });
  } finally { client.release(); }
});

app.post("/api/fusion-event", deviceAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { node_id, amplitude, prediction, confidence, image_base64 } = req.body;
    if (!node_id || amplitude === undefined || !prediction) return res.status(400).json({ error: "Missing fields" });

    const readingResult = await client.query(
      `INSERT INTO sensor_reading (node_id, amplitude, frequency, duration, recorded_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [node_id, amplitude, 50.0, 1.0]
    );
    const reading_id = readingResult.rows[0].reading_id;

    const VIBRATION_THRESHOLD = 15.0;
    let detection_status = "PENDING";
    let verify_required = true;
    
    if (amplitude > VIBRATION_THRESHOLD && prediction.toUpperCase() === "DURIAN") {
      detection_status = "VERIFIED"; verify_required = false;
    } else if (amplitude > VIBRATION_THRESHOLD && prediction.toUpperCase() !== "DURIAN") {
      detection_status = "REJECTED"; verify_required = false;
    }

    const detectionResult = await client.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status, detection_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [reading_id, prediction.toUpperCase(), confidence || 0, verify_required, detection_status]
    );
    const detection_id = detectionResult.rows[0].detection_id;

    if (image_base64) {
      await client.query(
        `INSERT INTO detection_image (detection_id, image_path, sequence_number, is_selected) VALUES ($1, $2, $3, $4)`,
        [detection_id, `/uploads/detection_${detection_id}.jpg`, 1, true]
      );
    }

    let notificationCreated = false;
    if (detection_status === "VERIFIED") {
      const farmerQuery = await client.query(`SELECT fp.farmer_id FROM farm_plot fp JOIN sensor_node sn ON sn.plot_id = fp.plot_id WHERE sn.node_id = $1`, [node_id]);
      if (farmerQuery.rows.length > 0) {
        await client.query(
          `INSERT INTO notification (detection_id, farmer_id, title, message_noti, is_read) VALUES ($1, $2, $3, $4, $5)`,
          [detection_id, farmerQuery.rows[0].farmer_id, 'Durian Detected!', `Durian jatuh dikesan dengan ${confidence}% keyakinan.`, false]
        );
        notificationCreated = true;
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ message: "Fusion processed", fusion_result: { detection_id, vibration_amplitude: amplitude, ai_prediction: prediction, final_status: detection_status, notification_triggered: notificationCreated } });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Failed to process sensor fusion" });
  } finally { client.release(); }
});

// ============================================================
// YOUR FRIEND'S SECURE START FUNCTION
// ============================================================
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 3000;
async function start() {
  try {
    await migrateAuth(pool);
    app.listen(PORT, () => console.log(`Duri.AI Backend running at http://localhost:${PORT}`));
  } catch (error) {
    console.error(`Auth setup failed: ${error.message}`);
    await pool.end();
    process.exitCode = 1;
  }
}
start();