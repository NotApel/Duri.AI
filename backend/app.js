// backend/app.js
const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { createAuth, migrateAuth } = require("./auth");

const app = express();
const allowedOrigins = new Set(
  (
    process.env.FRONTEND_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173"
  )
    .split(",")
    .map((value) => value.trim()),
);
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
  }),
);
app.use((req, res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin &&
    !allowedOrigins.has(req.headers.origin)
  )
    return res
      .status(403)
      .json({ error: "This request origin is not allowed." });
  next();
});
app.use(express.json({ limit: "32kb" }));

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

const auth = createAuth(pool);
app.use("/api/auth", auth.router);
app.use("/api", auth.requireSession);

// ============================================================
// FARMER ENDPOINTS
// ============================================================

// Get all farmers
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

// Get farmer by ID
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

// Get all farm plots for a farmer
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

// Create a new farm plot
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

// Get all sensor nodes for a farm plot
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

// Get latest detections
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

// Create a new detection
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
// FEEDBACK ENDPOINTS
// ============================================================

// Submit feedback for a detection
app.post("/api/detections/:detectionId/feedback", async (req, res) => {
  try {
    const { detectionId } = req.params;
    const { farmer_id, category_id, correct_detection, comment_farmer } =
      req.body;

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

    // Update detection status
    const newStatus = correct_detection ? "VERIFIED" : "REJECTED";
    await pool.query(
      "UPDATE detection SET detection_status = $1 WHERE detection_id = $2",
      [newStatus, detectionId],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Feedback error:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// ============================================================
// ANALYTICS ENDPOINTS
// ============================================================

// Get detection statistics
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

// ============================================================
// NOTIFICATION ENDPOINTS
// ============================================================

// Get notifications for a farmer
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
if (require.main === module) {
  migrateAuth(pool)
    .then(() => {
      app.listen(PORT, () =>
        console.log(`Duri.AI Backend running on port ${PORT}`),
      );
    })
    .catch((error) => {
      console.error(
        "Authentication schema setup failed:",
        error.code || error.message,
      );
      pool.end();
      process.exitCode = 1;
    });
}
module.exports = app;
