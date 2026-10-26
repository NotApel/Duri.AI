// main file for backend duri.ai
// guna node.js + postgres
// so dlm ni urus semua API endpoint untuk frontend and hardware

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const { createAuth, migrateAuth } = require("./auth");
const { createFarmRoutes } = require("./farmRoutes");
const { createDetectionRoutes } = require("./detectionRoutes");
const app = express();

// baca something dari fail .env/ setup .env
dotenv.config();

  // setup middleware

// 1. CORS (bagi izin frontend (REACT) panggil API backend)
const frontendOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map(origin => origin.trim()).filter(Boolean);
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
      [req.farmer.id] // dari token JWT
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch farmers" });
  }
});

// dpt maklumat farmer guna ID
app.get(["/api/farmer/:id", "/api/farmers/:id"], auth ,async (req, res) => {
  try {
    const { id } = req.params;

    // check if farmer tu access data dia or org lain
    if (String(id) !== String(req.farmer.id)) {
  return res.status(403).json({ error: "Access denied. You can only view your own data." });
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

// dpt senarai feedback category
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
}
);

  // 7. detection feedback endpoints - table detection feedback

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
      [req.farmer.id]
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
      [notificationId, req.farmer.id]
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
      return res.status(400).json({ error: "Missing required fields: node_id, prediction, confidence" });
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
      return res.status(400).json({ error: "Missing fields: node_id, amplitude, prediction" });
    }

    // 1. simpan result vibration
    const readingResult = await client.query(
      `INSERT INTO sensor_reading (node_id, amplitude, frequency, duration, recorded_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
      [node_id, amplitude, 50.0, 1.0]
    );
    const reading_id = readingResult.rows[0].reading_id;

    // 2. logik 2 sensor

const CONFIDENCE_THRESHOLD = 90.0; // Threshold keyakinan AI

let detection_status = "PENDING";
let verify_required = true;

// 1. AI yakin > 90% DAN ia DURIAN
if (prediction.toUpperCase() === "DURIAN" && confidence >= CONFIDENCE_THRESHOLD) {
  detection_status = "VERIFIED";
  verify_required = false;
} 
// 2. AI yakin > 90% TAPI ia BUKAN DURIAN
else if (prediction.toUpperCase() !== "DURIAN" && confidence >= CONFIDENCE_THRESHOLD) {
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
