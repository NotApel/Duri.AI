// backend/app.js
const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();     // <--- PASTIKAN BARIS INI ADA

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());

// Rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again after 15 minutes" }
});

// Middleware untuk ESP32 (Device API Key)
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
    const { full_name, username, email, password, phone_number } = req.body;

    if (!full_name || !username || !email || !password || !phone_number) {
      return res.status(400).json({
        error: "All fields are required",
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO farmer
        (full_name, username, email, password_hash, phone_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING farmer_id, full_name, username, email, phone_number, created_at, updated_at`,
      [full_name, username, email, password_hash, phone_number]
    );

    const newFarmer = result.rows[0];
const token = jwt.sign(
  { id: newFarmer.farmer_id, username: newFarmer.username },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

res.status(201).json({
  message: "Farmer registered successfully",
  token: token,
  farmer: newFarmer,
});
  } catch (error) {
    console.error("Register error:", error);

    if (error.code === "23505") {
      if (error.constraint === "farmer_username_key") {
        return res.status(400).json({ error: "Username already registered" });
      }
      if (error.constraint === "farmer_email_key") {
        return res.status(400).json({ error: "Email already registered" });
      }
    }

    res.status(500).json({ error: "Registration failed" });
  }
});

// Login farmer
app.post("/api/auth/login", loginLimiter , async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    const result = await pool.query(
      `SELECT farmer_id, full_name, username, email, password_hash, phone_number, created_at, updated_at
       FROM farmer
       WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const farmer = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, farmer.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    delete farmer.password_hash;

const token = jwt.sign(
  { id: farmer.farmer_id, username: farmer.username },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

res.json({
  message: "Login successful",
  token: token,
  farmer: farmer,
});
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

// Check current session
app.get("/api/auth/session", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT farmer_id, full_name, username, email, phone_number FROM farmer WHERE farmer_id = $1",
      [req.farmer.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Farmer not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Session error:", error);
    res.status(500).json({ error: "Failed to get session" });
  }
});

// ============================================================
// 1. FARMER ENDPOINTS (Table: farmer)
// ============================================================

// Get all farmers (supports /api/farmer and /api/farmers)
app.get(["/api/farmer", "/api/farmers"], auth ,async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT farmer_id, full_name, username, email, phone_number, created_at, updated_at FROM farmer ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get farmers error:", error);
    res.status(500).json({ error: "Failed to fetch farmers" });
  }
});

// Get farmer by ID
app.get(["/api/farmer/:id", "/api/farmers/:id"], auth ,async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "SELECT farmer_id, full_name, username, email, phone_number, created_at, updated_at FROM farmer WHERE farmer_id = $1",
      [id]
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
// 2. FARM PLOT ENDPOINTS (Table: farm_plot)
// ============================================================

// Get all plots for a farmer
app.get(["/api/farmer/:farmerId/farm-plot", "/api/farmers/:farmerId/plots"], auth, async (req, res) => {
  try {
    const { farmerId } = req.params;
    const result = await pool.query(
      "SELECT * FROM farm_plot WHERE farmer_id = $1 ORDER BY plot_name",
      [farmerId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get plots error:", error);
    res.status(500).json({ error: "Failed to fetch plots" });
  }
});

// Create farm plot
app.post(["/api/farmer/:farmerId/farm-plot", "/api/farmers/:farmerId/plots"], auth, async (req, res) => {
  try {
    const { farmerId } = req.params;
    const { farm_name, plot_name, plot_size, latitude, longitude } = req.body;

    if (!farm_name || !plot_name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: "Farm name, plot name, latitude, and longitude are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO farm_plot (farmer_id, farm_name, plot_name, plot_size, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [farmerId, farm_name, plot_name, plot_size || null, latitude, longitude]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create plot error:", error);
    res.status(500).json({ error: "Failed to create plot" });
  }
});

// ============================================================
// 3. SENSOR NODE ENDPOINTS (Table: sensor_node)
// ============================================================

app.get(["/api/farm-plot/:plotId/sensor-node", "/api/plots/:plotId/nodes"], auth, async (req, res) => {
  try {
    const { plotId } = req.params;
    const result = await pool.query(
      "SELECT * FROM sensor_node WHERE plot_id = $1 ORDER BY node_name",
      [plotId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get nodes error:", error);
    res.status(500).json({ error: "Failed to fetch nodes" });
  }
});

// ============================================================
// 4. DETECTION ENDPOINTS (Table: detection)
// ============================================================

app.get(["/api/detection", "/api/detections"], auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         d.*, 
         sn.node_name,
         COALESCE(
           json_agg(
             json_build_object(
               'image_id', di.image_id,
               'image_path', di.image_path,
               'sequence_number', di.sequence_number,
               'is_selected', di.is_selected
             )
           ) FILTER (WHERE di.image_id IS NOT NULL), '[]'
         ) AS images
       FROM detection d
       JOIN sensor_reading sr ON d.reading_id = sr.reading_id
       JOIN sensor_node sn ON sr.node_id = sn.node_id
       LEFT JOIN detection_image di ON d.detection_id = di.detection_id
       GROUP BY d.detection_id, sn.node_name
       ORDER BY d.detection_at DESC
       LIMIT 10`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get detections error:", error);
    res.status(500).json({ error: "Failed to fetch detections" });
  }
});

app.post(["/api/detection", "/api/detections"], auth, async (req, res) => {
  try {
    let {
      reading_id,
      prediction,
      confidence,
      verify_required,
      detection_status,
    } = req.body;

    if (!reading_id || !prediction || confidence === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    prediction = prediction.toUpperCase();
    if (!["DURIAN", "NOT_DURIAN"].includes(prediction)) {
      return res.status(400).json({
        error: "Invalid prediction value. Must be 'DURIAN' or 'NOT_DURIAN'",
      });
    }

    detection_status = detection_status ? detection_status.toUpperCase() : "PENDING";
    if (!["PENDING", "VERIFIED", "REJECTED"].includes(detection_status)) {
      return res.status(400).json({
        error: "Invalid detection_status. Must be 'PENDING', 'VERIFIED', or 'REJECTED'",
      });
    }

    const result = await pool.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [reading_id, prediction, confidence, verify_required || false, detection_status]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create detection error:", error);
    res.status(500).json({ error: "Failed to create detection" });
  }
});

// ============================================================
// 5. DETECTION IMAGE ENDPOINTS (Table: detection_image)
// ============================================================

app.get(["/api/detection/:detectionId/detection-image", "/api/detections/:detectionId/images"], auth, async (req, res) => {
  try {
    const { detectionId } = req.params;
    const result = await pool.query(
      "SELECT * FROM detection_image WHERE detection_id = $1 ORDER BY sequence_number ASC",
      [detectionId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get detection images error:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// ============================================================
// 6. FEEDBACK CATEGORY ENDPOINTS (Table: feedback_category)
// ============================================================

app.get(["/api/feedback-category", "/api/feedback-categories"], async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM feedback_category ORDER BY category_id ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get feedback categories error:", error);
    res.status(500).json({ error: "Failed to fetch feedback categories" });
  }
});

// ============================================================
// 7. DETECTION FEEDBACK ENDPOINTS (Table: detection_feedback)
// ============================================================

app.post(["/api/detection/:detectionId/detection-feedback", "/api/detections/:detectionId/feedback"], auth , async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { detectionId } = req.params;
    const { farmer_id, category_id, correct_detection, comment_farmer } = req.body;

    if (!farmer_id || correct_detection === undefined) {
      return res.status(400).json({
        error: "Farmer ID and correct_detection are required",
      });
    }

    const feedbackResult = await client.query(
      `INSERT INTO detection_feedback (detection_id, farmer_id, category_id, correct_detection, comment_farmer)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [detectionId, farmer_id, category_id || null, correct_detection, comment_farmer || null]
    );

    const newStatus = correct_detection ? "VERIFIED" : "REJECTED";
    await client.query(
      "UPDATE detection SET detection_status = $1 WHERE detection_id = $2",
      [newStatus, detectionId]
    );

    // Otomatis tambah rekod ke dalam training_queue
    await client.query(
      `INSERT INTO training_queue (feedback_id, queue_status)
       VALUES ($1, 'PENDING')`,
      [feedbackResult.rows[0].feedback_id]
    );

    await client.query("COMMIT");
    res.status(201).json(feedbackResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Feedback error:", error);
    res.status(500).json({ error: "Failed to submit feedback" });
  } finally {
    client.release();
  }
});

// ============================================================
// 8. TRAINING QUEUE ENDPOINTS (Table: training_queue)
// ============================================================

app.get(["/api/training-queue", "/api/training_queue"], auth , async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM training_queue ORDER BY queue_at DESC LIMIT 20"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get training queue error:", error);
    res.status(500).json({ error: "Failed to fetch training queue" });
  }
});

// ============================================================
// 9. NOTIFICATION ENDPOINTS (Table: notification)
// ============================================================

app.get(["/api/notification", "/api/notifications"], auth , async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notification ORDER BY created_at DESC LIMIT 50"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get notification error:", error);
    res.status(500).json({ error: "Failed to fetch notifications", details: error.message });
  }
});

// ============================================================
// 10. ANALYTICS STATS ENDPOINT
// ============================================================

app.get("/api/analytics/stats", auth, async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM detection");
    const verified = await pool.query(
      "SELECT COUNT(*) FROM detection WHERE detection_status = 'VERIFIED'"
    );
    const rejected = await pool.query(
      "SELECT COUNT(*) FROM detection WHERE detection_status = 'REJECTED'"
    );
    const pending = await pool.query(
      "SELECT COUNT(*) FROM detection WHERE detection_status = 'PENDING'"
    );

    res.json({
      total: parseInt(total.rows[0].count, 10),
      verified: parseInt(verified.rows[0].count, 10),
      rejected: parseInt(rejected.rows[0].count, 10),
      pending: parseInt(pending.rows[0].count, 10),
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ============================================================
// 11. SENSOR READING ENDPOINT (For ESP32 Hardware)
// ============================================================
app.post("/api/sensor-readings", deviceAuth, async (req, res) => {
  try {
    const { node_id, amplitude, frequency, duration } = req.body;

    // Validation
    if (!node_id || amplitude === undefined || frequency === undefined) {
      return res.status(400).json({ error: "Missing required fields: node_id, amplitude, frequency" });
    }

    // Insert into database
    const result = await pool.query(
      `INSERT INTO sensor_reading (node_id, amplitude, frequency, duration, recorded_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [node_id, amplitude, frequency, duration || null]
    );

    res.status(201).json({
      message: "Sensor reading saved successfully",
      reading: result.rows[0]
    });

  } catch (error) {
    console.error("Sensor reading error:", error);
    res.status(500).json({ error: "Failed to save sensor reading" });
  }
});

// ============================================================
// 12. IMAGE DETECTION ENDPOINT (For ESP32-CAM Hardware)
// ============================================================
app.post("/api/device/detections", deviceAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { node_id, prediction, confidence, image_base64 } = req.body;

    // Validation
    if (!node_id || !prediction || confidence === undefined) {
      return res.status(400).json({ error: "Missing required fields: node_id, prediction, confidence" });
    }

    // 1. Dapatkan reading_id terkini untuk node ini (untuk link detection dengan reading)
    // Kita ambil reading paling baru yang dimasukkan oleh sensor getaran
    const readingQuery = await client.query(
      `SELECT reading_id FROM sensor_reading WHERE node_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [node_id]
    );

    if (readingQuery.rows.length === 0) {
      return res.status(400).json({ error: "No sensor reading found for this node. Vibration data must be sent first." });
    }
    
    const reading_id = readingQuery.rows[0].reading_id;

    // 2. Simpan rekod Detection
    const detectionResult = await client.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status, detection_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [reading_id, prediction.toUpperCase(), confidence, false, 'PENDING']
    );
    
    const detection_id = detectionResult.rows[0].detection_id;

    // 3. Simpan Gambar (Jika ada)
    if (image_base64) {
      // Simpan path sementara (dalam real production, kau akan simpan gambar ke AWS S3 atau local folder)
      const imagePath = `/uploads/detection_${detection_id}.jpg`; 
      
      await client.query(
        `INSERT INTO detection_image (detection_id, image_path, sequence_number, is_selected)
         VALUES ($1, $2, $3, $4)`,
        [detection_id, imagePath, 1, true]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: "Detection and image processed successfully",
      detection: detectionResult.rows[0]
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Detection error:", error);
    res.status(500).json({ error: "Failed to process detection" });
  } finally {
    client.release();
  }
});

// ============================================================
// 13. SENSOR FUSION ENDPOINT (Gabungan Vibration + Image)
// ============================================================
app.post("/api/fusion-event", deviceAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { node_id, amplitude, prediction, confidence, image_base64 } = req.body;

    // Validation
    if (!node_id || amplitude === undefined || !prediction) {
      return res.status(400).json({ error: "Missing fields: node_id, amplitude, prediction" });
    }

    // 1. Simpan Reading (Vibration)
    const readingResult = await client.query(
      `INSERT INTO sensor_reading (node_id, amplitude, frequency, duration, recorded_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [node_id, amplitude, 50.0, 1.0] // Frequency & duration dummy untuk sementara
    );
    const reading_id = readingResult.rows[0].reading_id;

    // 2. LOGIK SENSOR FUSION
    const VIBRATION_THRESHOLD = 15.0; // Threshold untuk getaran kuat
    let detection_status = "PENDING";
    let verify_required = true;
    
    if (amplitude > VIBRATION_THRESHOLD && prediction.toUpperCase() === "DURIAN") {
      detection_status = "VERIFIED"; // Dua-dua setuju!
      verify_required = false;
    } else if (amplitude > VIBRATION_THRESHOLD && prediction.toUpperCase() !== "DURIAN") {
      detection_status = "REJECTED"; // Getaran kuat, tapi AI cakap bukan durian
      verify_required = false;
    }

    // 3. Simpan Detection
    const detectionResult = await client.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status, detection_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [reading_id, prediction.toUpperCase(), confidence || 0, verify_required, detection_status]
    );
    const detection_id = detectionResult.rows[0].detection_id;

    // 4. Simpan Gambar (Kalau ada)
    if (image_base64) {
      await client.query(
        `INSERT INTO detection_image (detection_id, image_path, sequence_number, is_selected)
         VALUES ($1, $2, $3, $4)`,
        [detection_id, `/uploads/detection_${detection_id}.jpg`, 1, true]
      );
    }

    // 5. Cipta Notification HANYA JIKA VERIFIED
    let notificationCreated = false;
    if (detection_status === "VERIFIED") {
      // Ambil farmer_id dari plot -> node
      const farmerQuery = await client.query(
        `SELECT fp.farmer_id FROM farm_plot fp 
         JOIN sensor_node sn ON sn.plot_id = fp.plot_id 
         WHERE sn.node_id = $1`, 
        [node_id]
      );
      
      if (farmerQuery.rows.length > 0) {
        const farmer_id = farmerQuery.rows[0].farmer_id;
        await client.query(
          `INSERT INTO notification (detection_id, farmer_id, title, message_noti, is_read)
           VALUES ($1, $2, $3, $4, $5)`,
          [detection_id, farmer_id, 'Durian Detected!', `Durian jatuh dikesan dengan ${confidence}% keyakinan.`, false]
        );
        notificationCreated = true;
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: "Sensor Fusion processed successfully",
      fusion_result: {
        detection_id: detection_id,
        vibration_amplitude: amplitude,
        ai_prediction: prediction,
        final_status: detection_status,
        notification_triggered: notificationCreated
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Fusion error:", error);
    res.status(500).json({ error: "Failed to process sensor fusion" });
  } finally {
    client.release();
  }
});

// ============================================================
// 14. PASSWORD RESET ENDPOINTS
// ============================================================

// Simpan OTP dalam memori (untuk demo FYP)
const resetCodes = {};

// 1. Minta Reset Password (Hantar OTP)
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Check email wujud tak
    const result = await pool.query("SELECT farmer_id FROM farmer WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Email not found" });
    }

    // Jana 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes[email] = otp;

    // SIMULASI: Print dalam terminal (bukan hantar email betul)
    console.log(`\n📧 [SIMULASI EMAIL] OTP untuk ${email} ialah: ${otp}\n`);

    res.json({ 
      message: "If the email exists, an OTP has been sent to your email.",
      // Untuk FYP demo, kita bagi OTP dalam response (biar cikgu nampak)
      demo_otp: otp 
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to process request" });
  }
});

// 2. Reset Password Guna OTP
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, new_password } = req.body;

    if (!email || !otp || !new_password) {
      return res.status(400).json({ error: "Email, OTP, and new password are required" });
    }

    // Check OTP betul ke tak
    if (!resetCodes[email] || resetCodes[email] !== otp) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Hash password baru
    const password_hash = await bcrypt.hash(new_password, 10);

    // Update database
    const result = await pool.query(
      "UPDATE farmer SET password_hash = $1, updated_at = NOW() WHERE email = $2 RETURNING farmer_id",
      [password_hash, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Farmer not found" });
    }

    // Padam OTP dari memori
    delete resetCodes[email];

    res.json({ message: "Password reset successful. You can now login with new password." });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ============================================================
// 404 NOT FOUND & ERROR HANDLER
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: "Something went wrong on the server" });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Duri.AI Backend running at http://localhost:${PORT}`);
});
