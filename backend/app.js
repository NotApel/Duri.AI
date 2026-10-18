// backend/app.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "duri_ai_db",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({
      status: "OK",
      message: "Duri.AI Backend is running! Database connected.",
    });
  } catch (error) {
    console.error("Database connection error:", error);
    res
      .status(500)
      .json({ status: "ERROR", message: "Database connection failed" });
  }
});

// ============================================================
// AUTHENTICATION ENDPOINTS
// ============================================================

// Register a new farmer
app.post("/api/auth/register", async (req, res) => {
  try {
    const { full_name, email, password_hash, phone_number } = req.body;

    if (!full_name || !email || !password_hash || !phone_number) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const username =
      email.split("@")[0] + "_" + Math.random().toString(36).substring(2, 6);

    const result = await pool.query(
      `INSERT INTO farmer (full_name, username, email, password_hash, phone_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING farmer_id, full_name, email, phone_number, created_at`,
      [full_name, username, email, password_hash, phone_number],
    );

    res.status(201).json({
      message: "Farmer registered successfully",
      farmer: result.rows[0],
    });
  } catch (error) {
    console.error("Register error:", error);
    if (error.constraint === "farmer_email_key") {
      return res.status(400).json({ error: "Email already registered" });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login farmer
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password_hash } = req.body;

    if (!email || !password_hash) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const result = await pool.query(
      `SELECT farmer_id, full_name, email, phone_number, created_at
       FROM farmer
       WHERE email = $1 AND password_hash = $2`,
      [email, password_hash],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({
      message: "Login successful",
      farmer: result.rows[0],
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// ============================================================
// FARMER ENDPOINTS
// ============================================================

app.get("/api/farmers", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT farmer_id, full_name, email, phone_number, created_at, updated_at FROM farmer ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get farmers error:", error);
    res.status(500).json({ error: "Failed to fetch farmers" });
  }
});

app.get("/api/farmers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT farmer_id, full_name, email, phone_number, created_at, updated_at FROM farmer WHERE farmer_id = $1",
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Farmer not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Get farmer error:", error);
    res.status(500).json({ error: "Failed to fetch farmer" });
  }
});

// ============================================================
// FARM PLOT ENDPOINTS
// ============================================================

app.get("/api/farmers/:farmerId/plots", async (req, res) => {
  try {
    const { farmerId } = req.params;
    const result = await pool.query(
      "SELECT * FROM farm_plot WHERE farmer_id = $1 ORDER BY plot_name",
      [farmerId],
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get plots error:", error);
    res.status(500).json({ error: "Failed to fetch plots" });
  }
});

app.post("/api/farmers/:farmerId/plots", async (req, res) => {
  try {
    const { farmerId } = req.params;
    const { farm_name, plot_name, plot_size, latitude, longitude } = req.body;

    if (!farm_name || !plot_name || !latitude || !longitude) {
      return res.status(400).json({
        error: "Farm name, plot name, latitude, and longitude are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO farm_plot (farmer_id, farm_name, plot_name, plot_size, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [farmerId, farm_name, plot_name, plot_size, latitude, longitude],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create plot error:", error);
    res.status(500).json({ error: "Failed to create plot" });
  }
});

// ============================================================
// SENSOR NODE ENDPOINTS
// ============================================================

app.get("/api/plots/:plotId/nodes", async (req, res) => {
  try {
    const { plotId } = req.params;
    const result = await pool.query(
      "SELECT * FROM sensor_node WHERE plot_id = $1 ORDER BY node_name",
      [plotId],
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get nodes error:", error);
    res.status(500).json({ error: "Failed to fetch nodes" });
  }
});

// ============================================================
// DETECTION (ALERT) ENDPOINTS
// ============================================================

app.get("/api/detections", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, sn.node_name 
       FROM detection d
       JOIN sensor_reading sr ON d.reading_id = sr.reading_id
       JOIN sensor_node sn ON sr.node_id = sn.node_id
       ORDER BY d.detection_at DESC
       LIMIT 10`,
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get detections error:", error);
    res.status(500).json({ error: "Failed to fetch detections" });
  }
});

app.post("/api/detections", async (req, res) => {
  try {
    const {
      reading_id,
      prediction,
      confidence,
      verify_required,
      detection_status,
    } = req.body;

    if (!reading_id || !prediction || confidence === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        reading_id,
        prediction,
        confidence,
        verify_required || false,
        detection_status || "PENDING",
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create detection error:", error);
    res.status(500).json({ error: "Failed to create detection" });
  }
});

// ============================================================
// FEEDBACK ENDPOINTS (SELF-LEARNING)
// ============================================================

app.post("/api/detections/:detectionId/feedback", async (req, res) => {
  try {
    const { detectionId } = req.params;
    const {
      farmer_id,
      category_id,
      correct_detection,
      comment_farmer,
      image_base64,
    } = req.body;

    if (!farmer_id || correct_detection === undefined) {
      return res
        .status(400)
        .json({ error: "Farmer ID and correct_detection are required" });
    }

    const result = await pool.query(
      `INSERT INTO detection_feedback (detection_id, farmer_id, category_id, correct_detection, comment_farmer)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [detectionId, farmer_id, category_id, correct_detection, comment_farmer],
    );

    const newStatus = correct_detection ? "VERIFIED" : "REJECTED";
    await pool.query(
      "UPDATE detection SET detection_status = $1 WHERE detection_id = $2",
      [newStatus, detectionId],
    );

    if (image_base64) {
      const dir = path.join(__dirname, "feedback_images");

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }

      const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
      const imagePath = path.join(dir, `feedback_${detectionId}.jpg`);
      fs.writeFileSync(imagePath, base64Data, "base64");

      console.log(`Saved feedback image for training: ${imagePath}`);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Feedback error:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// ============================================================
// ANALYTICS ENDPOINTS
// ============================================================

app.get("/api/analytics/stats", async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM detection");
    const verified = await pool.query(
      "SELECT COUNT(*) FROM detection WHERE detection_status = 'VERIFIED'",
    );
    const rejected = await pool.query(
      "SELECT COUNT(*) FROM detection WHERE detection_status = 'REJECTED'",
    );
    const pending = await pool.query(
      "SELECT COUNT(*) FROM detection WHERE detection_status = 'PENDING'",
    );

    res.json({
      total: parseInt(total.rows[0].count),
      verified: parseInt(verified.rows[0].count),
      rejected: parseInt(rejected.rows[0].count),
      pending: parseInt(pending.rows[0].count),
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.get("/api/analytics/training", async (req, res) => {
  try {
    const corrections = await pool.query(
      "SELECT COUNT(*) FROM detection_feedback",
    );
    const pending = await pool.query(
      "SELECT COUNT(*) FROM training_queue WHERE queue_status = 'PENDING'",
    );

    const totalCorrections = parseInt(corrections.rows[0].count);

    const accuracyHistory = [
      { week: "Week 1", accuracy: 85 },
      { week: "Week 2", accuracy: 92 },
      { week: "Week 3", accuracy: 99.93 },
    ];

    res.json({
      totalCorrections: totalCorrections,
      pendingTraining: parseInt(pending.rows[0].count),
      farmerPoints: totalCorrections * 10,
      currentAccuracy: 99.93,
      lastRetrained: "2026-10-18 10:30 AM",
      accuracyHistory: accuracyHistory,
    });
  } catch (error) {
    console.error("Training stats error:", error);
    res.status(500).json({ error: "Failed to fetch training stats" });
  }
});

// ============================================================
// TRIGGER AI RETRAINING
// ============================================================
app.post("/api/analytics/retrain", (req, res) => {
  const pythonPath =
    "C:\\Users\\Acer\\DuriAI_TFLite\\tflite_env\\Scripts\\python.exe";
  const scriptPath = "C:\\Users\\Acer\\DuriAI_TFLite\\retrain_model.py";
  const command = `"${pythonPath}" "${scriptPath}"`;

  console.log("Starting AI retraining from UI...");

  exec(
    command,
    {
      maxBuffer: 1024 * 1024 * 50,
      timeout: 600000,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    },
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Retraining error: ${error.message}`);
        return res.status(500).json({
          error: "Retraining failed",
          details: error.message,
          pythonError: stderr,
        });
      }
      console.log("Retraining complete!");
      res.json({ message: "Retraining successful" });
    },
  );
});

// ============================================================
// NOTIFICATION ENDPOINTS
// ============================================================

app.get("/api/farmers/:farmerId/notifications", async (req, res) => {
  try {
    const { farmerId } = req.params;
    const result = await pool.query(
      `SELECT * FROM notification 
       WHERE farmer_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [farmerId],
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Duri.AI Backend running at http://localhost:${PORT}`);
});
