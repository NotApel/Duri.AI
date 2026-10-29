// main file for backend duri.ai
// guna node.js + postgres
// so dlm ni urus semua API endpoint untuk frontend and hardware

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const rateLimit = require("express-rate-limit");
const cron = require("node-cron"); // NEW: Untuk auto-retraining
const { createAuth, migrateAuth } = require("./auth");
const { createFarmRoutes } = require("./farmRoutes");
const { createDetectionRoutes } = require("./detectionRoutes");
const app = express();

// baca something dari fail .env/ setup .env
dotenv.config();

// setup middleware

// 1. CORS (bagi izin frontend (REACT) panggil API backend)
const frontendOrigins = (
  process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: frontendOrigins, credentials: true }));

// 2. JSON parser (translate data JSON dari frontend ke (req.body))
app.use(express.json({ limit: "50mb" }));

// middleware hardware: esp32 (Device API Key)

// semak API key untuk esp32 jer
const deviceAuth = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.DEVICE_API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }
  next();
};

// rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    error: "Too many login attempts, please try again after 15 minutes",
  },
});

// NEW: Rate Limiter untuk butang Retrain (Max 3 kali sehari)
const retrainLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 jam
  max: 3,
  message: {
    error:
      "Manual retraining limit reached for today. The AI will automatically retrain this Sunday.",
  },
});

// database connection - postgres
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "duri_ai_db",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
});

// authentication router

// handle login,register dari auth.js
const { router: authRouter, authenticate: auth } = createAuth(pool);
app.use("/api/auth", authRouter);

  // check health
// RETRAINING VARIABLES
let retrainStatus = "idle";
let retrainError = "";
let lastRetrainTime = "Not yet retrained";
let currentModelAccuracy = 99.93;

// check health

// check backend hidup n connected x?
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({
      status: "OK",
      message: "Duri.AI Backend is running! Database connected.",
    });
  } catch {
    res
      .status(500)
      .json({ status: "ERROR", message: "Database connection failed" });
  }
});

// 1. farmer endpoint - table farmer

// dpt profil farmer yang sedang login
app.get(["/api/farmer", "/api/farmers"], auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT farmer_id, full_name, username, email, phone_number, created_at, updated_at FROM farmer WHERE farmer_id = $1",
      [req.farmer.id], // dari token JWT
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch farmers" });
  }
});

// dpt maklumat farmer guna ID
app.get(["/api/farmer/:id", "/api/farmers/:id"], auth, async (req, res) => {
  try {
    const { id } = req.params;

    // check if farmer tu access data dia or org lain
    if (String(id) !== String(req.farmer.id)) {
      return res
        .status(403)
        .json({ error: "Access denied. You can only view your own data." });
    }

    const result = await pool.query(
      "SELECT farmer_id, full_name, username, email, phone_number, created_at, updated_at FROM farmer WHERE farmer_id = $1",
      [req.params.id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Farmer not found" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch farmer" });
  }
});

// Farm configuration, device locations and detection history.
app.use("/api", createFarmRoutes(pool, auth, deviceAuth));
app.use("/api", createDetectionRoutes(pool, auth));
// 2. farm plot endpoint - table farmplot

// dpt semua maklumat plot
app.get(
  ["/api/farmer/:farmerId/farm-plot", "/api/farmers/:farmerId/plots"],
  auth,
  async (req, res) => {
    try {
      const { farmerId } = req.params;

      if (String(farmerId) !== String(req.farmer.id)) {
        return res.status(403).json({ error: "Access denied." });
      }

      const result = await pool.query(
        "SELECT * FROM farm_plot WHERE farmer_id = $1 ORDER BY plot_name",
        [req.params.farmerId],
      );
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch plots" });
    }
  },
);

// create farmplot
app.post(
  ["/api/farmer/:farmerId/farm-plot", "/api/farmers/:farmerId/plots"],
  auth,
  async (req, res) => {
    try {
      const { farmerId } = req.params;

      if (String(farmerId) !== String(req.farmer.id)) {
        return res.status(403).json({ error: "Access denied." });
      }

      const { farm_name, plot_name, plot_size, latitude, longitude } = req.body;
      if (
        !farm_name ||
        !plot_name ||
        latitude === undefined ||
        latitude === null ||
        longitude === undefined ||
        longitude === null
      ) {
        return res.status(400).json({
          error: "Farm name, plot name, latitude, and longitude are required",
        });
      }
      const result = await pool.query(
        `INSERT INTO farm_plot (farmer_id, farm_name, plot_name, plot_size, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          req.params.farmerId,
          farm_name,
          plot_name,
          plot_size || null,
          latitude,
          longitude,
        ],
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to create plot" });
    }
  },
);

// Edit farm plot
app.patch("/api/plots/:plotId", auth, async (req, res) => {
  try {
    const { plotId } = req.params;
    const { farm_name, plot_name, plot_size, latitude, longitude } = req.body;

    const plotCheck = await pool.query(
      "SELECT farmer_id FROM farm_plot WHERE plot_id = $1",
      [plotId],
    );

    if (plotCheck.rows.length === 0) {
      return res.status(404).json({ error: "Plot not found" });
    }

    if (String(plotCheck.rows[0].farmer_id) !== String(req.farmer.id)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const result = await pool.query(
      `UPDATE farm_plot 
       SET farm_name = $1, plot_name = $2, plot_size = $3, latitude = $4, longitude = $5, updated_at = NOW()
       WHERE plot_id = $6
       RETURNING *`,
      [farm_name, plot_name, plot_size || null, latitude, longitude, plotId],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update plot error:", error);
    res.status(500).json({ error: "Failed to update plot" });
  }
});

// 3. sensor node endpoint - table sensornode

// dpt semua maklumat sensor node
app.post("/api/plots/:plotId/nodes", auth, async (req, res) => {
  try {
    const { plotId } = req.params;
    const { node_name, firmware_version } = req.body;

    const plotCheck = await pool.query(
      "SELECT farmer_id FROM farm_plot WHERE plot_id = $1",
      [plotId],
    );

    if (plotCheck.rows.length === 0) {
      return res.status(404).json({ error: "Plot not found" });
    }

    if (String(plotCheck.rows[0].farmer_id) !== String(req.farmer.id)) {
      return res.status(403).json({ error: "Access denied." });
    }

    if (!node_name || node_name.trim().length === 0) {
      return res.status(400).json({ error: "Node name is required" });
    }

    const result = await pool.query(
      `INSERT INTO sensor_node (plot_id, node_name, status, battery_level, firmware_version, last_ping_at)
       VALUES ($1, $2, 'OFFLINE', NULL, $3, NULL)
       RETURNING *`,
      [plotId, node_name.trim(), firmware_version || null],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Register node error:", error);
    res.status(500).json({ error: "Failed to register node" });
  }
});

// Update sensor node
app.patch("/api/nodes/:nodeId", auth, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { node_name, firmware_version } = req.body;

    const nodeCheck = await pool.query(
      `SELECT sn.node_id, fp.farmer_id 
       FROM sensor_node sn 
       JOIN farm_plot fp ON sn.plot_id = fp.plot_id 
       WHERE sn.node_id = $1`,
      [nodeId],
    );

    if (nodeCheck.rows.length === 0) {
      return res.status(404).json({ error: "Node not found" });
    }

    if (String(nodeCheck.rows[0].farmer_id) !== String(req.farmer.id)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const result = await pool.query(
      `UPDATE sensor_node 
       SET node_name = $1, firmware_version = $2
       WHERE node_id = $3
       RETURNING *`,
      [node_name, firmware_version || null, nodeId],
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update node error:", error);
    res.status(500).json({ error: "Failed to update node" });
  }
});
// 4. detection endpoints - table detection

// dpt maklumat detection
app.get(["/api/detection", "/api/detections"], auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, sn.node_name,
         COALESCE(json_agg(json_build_object('image_id', di.image_id, 'image_path', di.image_path, 'sequence_number', di.sequence_number, 'is_selected', di.is_selected)) FILTER (WHERE di.image_id IS NOT NULL), '[]') AS images
       FROM detection d
       JOIN sensor_reading sr ON d.reading_id = sr.reading_id
       JOIN sensor_node sn ON sr.node_id = sn.node_id
       LEFT JOIN detection_image di ON d.detection_id = di.detection_id
       GROUP BY d.detection_id, sn.node_name
       ORDER BY d.detection_at DESC LIMIT 10`,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch detections" });
  }
});

// create detection baru
app.post(["/api/detection", "/api/detections"], auth, async (req, res) => {
  try {
    let {
      reading_id,
      prediction,
      confidence,
      verify_required,
      detection_status,
    } = req.body;
    if (!reading_id || !prediction || confidence === undefined)
      return res.status(400).json({ error: "Missing required fields" });

    if (typeof prediction !== "string" || !["DURIAN","NOT_DURIAN"].includes(prediction.toUpperCase()))
      return res.status(400).json({error:"Invalid prediction."});
    const ownReading = await pool.query("SELECT 1 FROM sensor_reading sr JOIN sensor_node sn ON sn.node_id=sr.node_id JOIN farm_plot fp ON fp.plot_id=sn.plot_id WHERE sr.reading_id=$1 AND fp.farmer_id=$2",[reading_id,req.farmer.id]);
    if (!ownReading.rows.length) return res.status(404).json({error:"Sensor reading not found."});

    prediction = prediction.toUpperCase();
    detection_status = detection_status
      ? detection_status.toUpperCase()
      : "PENDING";

    const result = await pool.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        reading_id,
        prediction,
        confidence,
        verify_required || false,
        detection_status,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to create detection" });
  }
});

// 5. detection image endpoints - table detection-image

  // 6. feedback category endpoints - table feedback category
//dpt gambar untuk selection detection
app.get(
  [
    "/api/detection/:detectionId/detection-image",
    "/api/detections/:detectionId/images",
  ],
  auth,
  async (req, res) => {
    try {
      const { detectionId } = req.params;
      const result = await pool.query(
        "SELECT * FROM detection_image WHERE detection_id = $1 ORDER BY sequence_number ASC",
        [detectionId],
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Get detection images error:", error);
      res.status(500).json({ error: "Failed to fetch images" });
    }
  },
);

// 6. feedback category endpoints - table feedback category

// dpt senarai feedback category
app.get(
  ["/api/feedback-category", "/api/feedback-categories"],
  async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM feedback_category ORDER BY category_id ASC",
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Get feedback categories error:", error);
      res.status(500).json({ error: "Failed to fetch feedback categories" });
    }
  },
);

// 7. detection feedback endpoints - table detection feedback

// post feedback untuk detection
app.post(
  [
    "/api/detection/:detectionId/detection-feedback",
    "/api/detections/:detectionId/feedback",
  ],
  auth,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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

      const feedbackResult = await client.query(
        `INSERT INTO detection_feedback (detection_id, farmer_id, category_id, correct_detection, comment_farmer)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          detectionId,
          farmer_id,
          category_id || null,
          correct_detection,
          comment_farmer || null,
        ],
      );

      const newStatus = correct_detection ? "VERIFIED" : "REJECTED";
      await client.query(
        "UPDATE detection SET detection_status = $1 WHERE detection_id = $2",
        [newStatus, detectionId],
      );

      await client.query(
        `INSERT INTO training_queue (feedback_id, queue_status) VALUES ($1, 'PENDING')`,
        [feedbackResult.rows[0].feedback_id],
      );

      // Optional: Simpan gambar feedback jika ada
      if (image_base64) {
        const dir = path.join(__dirname, "feedback_images");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(
          path.join(dir, `feedback_${detectionId}.jpg`),
          Buffer.from(base64Data, "base64"),
        );
      }

      await client.query("COMMIT");
      res.status(201).json(feedbackResult.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    } finally {
      client.release();
    }
  },
);

app.get(
  ["/api/training-queue", "/api/training_queue"],
  auth,
  async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT tq.* FROM training_queue tq JOIN detection_feedback df ON df.feedback_id=tq.feedback_id WHERE df.farmer_id=$1 ORDER BY tq.queue_at DESC,tq.queue_id DESC LIMIT 20",
        [req.farmer.id],
      );
      res.json(result.rows);
    } catch {
      res.status(500).json({ error: "Failed to fetch training queue" });
    }
  },
);

// 9. notification endpoint - table notfication

// dpt all the noti
app.get(["/api/notification", "/api/notifications"], auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notification WHERE farmer_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.farmer.id],
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Get notification error:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// Mark notification as read
app.patch("/api/notifications/:notificationId/read", auth, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const result = await pool.query(
      `UPDATE notification 
       SET is_read = TRUE 
       WHERE notification_id = $1 AND farmer_id = $2 
       RETURNING *`,
      [notificationId, req.farmer.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// 10. analytics endpoint

// dpt analytics stat
app.get("/api/analytics/stats", auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE d.detection_status='VERIFIED')::int AS verified,
      count(*) FILTER (WHERE d.detection_status='REJECTED')::int AS rejected,
      count(*) FILTER (WHERE d.detection_status='PENDING')::int AS pending
      FROM detection d JOIN sensor_reading sr ON sr.reading_id=d.reading_id
      JOIN sensor_node sn ON sn.node_id=sr.node_id JOIN farm_plot fp ON fp.plot_id=sn.plot_id
      WHERE fp.farmer_id=$1`,[req.farmer.id]);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

app.use("/api", require("./trainingRoutes").createTrainingRoutes(pool, auth));

// Disabled nodes retain history but cannot submit new device reports.
app.use(["/api/sensor-readings", "/api/device/detections", "/api/fusion-event"], deviceAuth, async (req,res,next) => {
  if (req.method !== "POST") return next();
  const nodeId = req.body?.node_id;
  if ((typeof nodeId === "number" && !Number.isSafeInteger(nodeId)) || !require("./apiHelpers").id(String(nodeId ?? "")))
    return res.status(400).json({error:"Invalid node ID."});
  try {
    const active = await pool.query("SELECT 1 FROM sensor_node WHERE node_id=$1 AND is_active=TRUE",[nodeId]);
    if (!active.rows.length) return res.status(404).json({error:"Active node not found."});
    next();
  } catch { res.status(503).json({error:"Unable to check node availability."}); }
    res.json({
      totalCorrections: totalCorrections,
      pendingTraining: parseInt(pending.rows[0].count),
      farmerPoints: totalCorrections * 10,
      currentAccuracy: currentModelAccuracy,
      lastRetrained: lastRetrainTime,
      accuracyHistory: [
        { week: "Week 1", accuracy: 85 },
        { week: "Week 2", accuracy: 92 },
        { week: "Week 3", accuracy: currentModelAccuracy },
      ],
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch training stats" });
  }
});

// NEW: Tambah retrainLimiter
app.post("/api/analytics/retrain", auth, retrainLimiter, (req, res) => {
  if (retrainStatus === "processing") {
    return res
      .status(400)
      .json({ error: "Retraining is already in progress. Please wait." });
  }

  // FIXED: Uses .env variables with fallbacks
  const pythonPath =
    process.env.PYTHON_PATH ||
    "C:\\Users\\Acer\\DuriAI_TFLite\\tflite_env\\Scripts\\python.exe";
  const scriptPath =
    process.env.RETRAIN_SCRIPT_PATH ||
    "C:\\Users\\Acer\\DuriAI_TFLite\\retrain_model.py";

  console.log("Starting AI retraining in the background...");
  retrainStatus = "processing";
  retrainError = "";

  const pyProcess = spawn(`"${pythonPath}" "${scriptPath}"`, { shell: true });

  pyProcess.stdout.on("data", (data) => console.log(`[Python]: ${data}`));
  pyProcess.stderr.on("data", (data) => {
    retrainError = data.toString();
  });

  pyProcess.on("close", async (code) => {
    if (code === 0) {
      console.log("AI Retraining finished successfully!");
      retrainStatus = "success";
      lastRetrainTime = new Date().toLocaleString("en-MY", {
        timeZone: "Asia/Kuala_Lumpur",
      });

      try {
        // 1. Clear the database queue so "Waiting for Retraining" drops to 0
        await pool.query(
          "UPDATE training_queue SET queue_status = 'COMPLETED' WHERE queue_status = 'PENDING'",
        );
        console.log("Training queue cleared in database.");

        // 2. Read the actual accuracy from the Python output file
        // FIXED: Uses .env variable with fallback
        const accuracyPath =
          process.env.ACCURACY_FILE_PATH ||
          "C:\\Users\\Acer\\DuriAI_TFLite\\accuracy.txt";
        if (fs.existsSync(accuracyPath)) {
          const accString = fs.readFileSync(accuracyPath, "utf8").trim();
          currentModelAccuracy = parseFloat(accString);
          console.log(`Updated AI Accuracy to ${currentModelAccuracy}%`);
        }
      } catch (err) {
        console.error("Failed to update DB or read accuracy:", err);
      }
    } else {
      console.log("AI Retraining failed.");
      retrainStatus = "failed";
    }
  });

  res.json({ message: "Retraining started successfully in the background!" });
});

app.get("/api/analytics/retrain-status", auth, (req, res) => {
  res.json({ status: retrainStatus, error: retrainError });
});

// NEW: AUTOMATED WEEKLY RETRAINING (CRON JOB)
cron.schedule("0 2 * * 0", () => {
  console.log("Weekly schedule reached. Triggering automated retraining...");

  if (retrainStatus !== "processing") {
    retrainStatus = "processing";
    const pythonPath =
      process.env.PYTHON_PATH ||
      "C:\\Users\\Acer\\DuriAI_TFLite\\tflite_env\\Scripts\\python.exe";
    const scriptPath =
      process.env.RETRAIN_SCRIPT_PATH ||
      "C:\\Users\\Acer\\DuriAI_TFLite\\retrain_model.py";

    const pyProcess = spawn(`"${pythonPath}" "${scriptPath}"`, { shell: true });

    pyProcess.on("close", async (code) => {
      if (code === 0) {
        retrainStatus = "success";
        lastRetrainTime = new Date().toLocaleString("en-MY", {
          timeZone: "Asia/Kuala_Lumpur",
        });
        await pool.query(
          "UPDATE training_queue SET queue_status = 'COMPLETED' WHERE queue_status = 'PENDING'",
        );

        const accuracyPath =
          process.env.ACCURACY_FILE_PATH ||
          "C:\\Users\\Acer\\DuriAI_TFLite\\accuracy.txt";
        if (fs.existsSync(accuracyPath)) {
          currentModelAccuracy = parseFloat(
            fs.readFileSync(accuracyPath, "utf8").trim(),
          );
        }
        console.log("✅ Automated Weekly Retraining Complete!");
      } else {
        retrainStatus = "failed";
      }
    });
  }
});

// ============================================================
// HARDWARE ENDPOINTS
// ============================================================
app.post("/api/sensor-readings", deviceAuth, async (req, res) => {
  try {
    const { node_id, amplitude, frequency, duration } = req.body;
    if (!node_id || amplitude === undefined || frequency === undefined)
      return res.status(400).json({ error: "Missing fields" });

    const result = await pool.query(
      `INSERT INTO sensor_reading (node_id, amplitude, frequency, duration, recorded_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [node_id, amplitude, frequency, duration || null],
    );
    res
      .status(201)
      .json({ message: "Sensor reading saved", reading: result.rows[0] });
  } catch {
    res.status(500).json({ error: "Failed to save sensor reading" });
  }
});

// 12. image detection endpoint - esp32 cam

// hardware hantar gambar n prediction
app.post("/api/device/detections", deviceAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { node_id, prediction, confidence, image_base64 } = req.body;
    if (!node_id || !prediction || confidence === undefined)
      return res.status(400).json({ error: "Missing fields" });

    // Validation
    if (!node_id || !prediction || confidence === undefined) {
      return res.status(400).json({
        error: "Missing required fields: node_id, prediction, confidence",
      });
    }

    const readingQuery = await client.query(
      `SELECT reading_id FROM sensor_reading WHERE node_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [node_id],
    );
    if (readingQuery.rows.length === 0)
      return res.status(400).json({ error: "No sensor reading found" });

    const reading_id = readingQuery.rows[0].reading_id;
    const detectionResult = await client.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status, detection_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [reading_id, prediction.toUpperCase(), confidence, false, "PENDING"],
    );
    const detection_id = detectionResult.rows[0].detection_id;

    if (image_base64) {
      
      const imagePath = `/uploads/detection_${detection_id}.jpg`;

      await client.query(
        `INSERT INTO detection_image (detection_id, image_path, sequence_number, is_selected) VALUES ($1, $2, $3, $4)`,
        [detection_id, `/uploads/detection_${detection_id}.jpg`, 1, true],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({
      message: "Detection processed",
      detection: detectionResult.rows[0],
    });
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to process detection" });
  } finally {
    client.release();
  }
});

// 13. sensor fusion endpoint - vibrate + cam

// gabung 2 sensor
app.post("/api/fusion-event", deviceAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { node_id, amplitude, prediction, confidence, image_base64 } =
      req.body;
    if (!node_id || amplitude === undefined || !prediction)
      return res.status(400).json({ error: "Missing fields" });

    if (!node_id || amplitude === undefined || !prediction) {
      return res
        .status(400)
        .json({ error: "Missing fields: node_id, amplitude, prediction" });
    }

    // 1. simpan result vibration
    const readingResult = await client.query(
      `INSERT INTO sensor_reading (node_id, amplitude, frequency, duration, recorded_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [node_id, amplitude, 50.0, 1.0],
    );
    const reading_id = readingResult.rows[0].reading_id;

    // 2. logik 2 sensor

    const CONFIDENCE_THRESHOLD = 90.0; // Threshold keyakinan AI

    let detection_status = "PENDING";
    let verify_required = true;

    // 1. AI yakin > 90% DAN ia DURIAN
    if (
      prediction.toUpperCase() === "DURIAN" &&
      confidence >= CONFIDENCE_THRESHOLD
    ) {
      detection_status = "VERIFIED";
      verify_required = false;
    }
    // 2. AI yakin > 90% TAPI ia BUKAN DURIAN
    else if (
      prediction.toUpperCase() !== "DURIAN" &&
      confidence >= CONFIDENCE_THRESHOLD
    ) {
      detection_status = "REJECTED";
      verify_required = false;
    }
    // 3. AI tak cukup yakin (< 90%), tak kira apa prediction
    else {
      detection_status = "PENDING";
      verify_required = true;
    }

    // 3. simpan detection
    const detectionResult = await client.query(
      `INSERT INTO detection (reading_id, prediction, confidence, verify_required, detection_status, detection_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [
        reading_id,
        prediction.toUpperCase(),
        confidence || 0,
        verify_required,
        detection_status,
      ],
    );
    const detection_id = detectionResult.rows[0].detection_id;

    if (image_base64) {
      await client.query(
        `INSERT INTO detection_image (detection_id, image_path, sequence_number, is_selected) VALUES ($1, $2, $3, $4)`,
        [detection_id, `/uploads/detection_${detection_id}.jpg`, 1, true],
      );
    }

    // 5. create noti
    let notificationCreated = false;
    if (detection_status === "VERIFIED") {
      const farmerQuery = await client.query(
        `SELECT fp.farmer_id FROM farm_plot fp JOIN sensor_node sn ON sn.plot_id = fp.plot_id WHERE sn.node_id = $1`,
        [node_id],
      );
      if (farmerQuery.rows.length > 0) {
        await client.query(
          `INSERT INTO notification (detection_id, farmer_id, title, message_noti, is_read) VALUES ($1, $2, $3, $4, $5)`,
          [
            detection_id,
            farmerQuery.rows[0].farmer_id,
            "Durian Detected!",
            `Durian jatuh dikesan dengan ${confidence}% keyakinan.`,
            false,
          ],
        );
        notificationCreated = true;
      }
    }
    await client.query("COMMIT");
    res.status(201).json({
      message: "Fusion processed",
      fusion_result: {
        detection_id,
        vibration_amplitude: amplitude,
        ai_prediction: prediction,
        final_status: detection_status,
        notification_triggered: notificationCreated,
      },
    });
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed to process sensor fusion" });
  } finally {
    client.release();
  }
});

// 404 NOT FOUND & ERROR HANDLER

//if route x wujud :
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: "Something went wrong on the server" });
});

// START SERVER

const PORT = process.env.PORT || 3000;
async function start() {
  try {
    await migrateAuth(pool);
    app.listen(PORT, () =>
      console.log(`Duri.AI Backend running at http://localhost:${PORT}`),
    );
  } catch (error) {
    console.error(`Auth setup failed: ${error.message}`);
    await pool.end();
    process.exitCode = 1;
  }
}
start();
