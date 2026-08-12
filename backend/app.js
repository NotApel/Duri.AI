const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Duri.AI Backend is running!",
  });
});

// Mock alerts - FRONTEND NEEDS THIS
app.get("/api/alerts/mock", (req, res) => {
  res.json([
    {
      id: "1",
      nodeName: "Node A1",
      confidence: 96,
      gpsLat: 3.1234,
      gpsLng: 101.6965,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      nodeName: "Node B2",
      confidence: 88,
      gpsLat: 3.1256,
      gpsLng: 101.6987,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    },
  ]);
});

// Mock stats - FRONTEND NEEDS THIS TOO
app.get("/api/analytics/stats", (req, res) => {
  res.json({
    total: 1247,
    confidence: 91,
    falseAlarmRate: 4.2,
    activeNodes: 4,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Backend running at http://localhost:${PORT}`);
});
