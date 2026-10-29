const { Router, json } = require("express");
const rateLimit = require("express-rate-limit");
const { createDeviceAuth } = require("./deviceAuth");
const { validateEvent } = require("./eventValidation");
const { route, transaction, fail } = require("./apiHelpers");
const { enqueueNotification } = require("./push");
function createProcessedEventRoutes(pool, storage) {
  const router = Router();
  const ipLimiter = rateLimit({
    windowMs: 60000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many device requests. Retry shortly." },
  });
  const gatewayLimiter = rateLimit({
    windowMs: 60000,
    limit: 30,
    keyGenerator: (req) => req.device.gateway_id,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Gateway event limit reached. Retry with the same event ID.",
    },
  });
  router.post(
    "/events",
    ipLimiter,
    createDeviceAuth(pool),
    gatewayLimiter,
    json({ limit: "15mb" }),
    route(async (req, res) => {
      const event = validateEvent(req.body),
        device = req.device;
      if (
        req.headers["x-duriai-simulation"] === "true" &&
        !device.is_simulation
      )
        fail(403, "The simulator requires a simulation gateway.");
      const existing = (
        await pool.query(
          "SELECT * FROM gateway_event WHERE gateway_id=$1 AND source_event_id=$2",
          [device.gateway_id, event.evidence.source_event_id],
        )
      ).rows[0];
      if (existing && existing.payload_hash !== event.payloadHash)
        fail(409, "This event ID was already used with different content.");
      if (existing?.state === "COMPLETED")
        return res.set("Cache-Control", "no-store").json({
          duplicate: true,
          detection_id: existing.detection_id,
          notification_id: existing.notification_id,
          source_event_id: event.evidence.source_event_id,
          simulation: existing.is_simulation,
          push_jobs_created: 0,
          push_delivery: "asynchronous",
        });
      if (!storage.configured)
        fail(503, "Private image storage is not configured.");
      // Claim the identifier durably before external storage I/O. Failed attempts can resume.
      const owned = await pool.query(
        `SELECT 1 FROM gateway_node gn JOIN sensor_node sn ON sn.node_id=gn.node_id JOIN farm_plot fp ON fp.plot_id=sn.plot_id
      WHERE gn.gateway_id=$1 AND gn.node_id=$2 AND fp.farmer_id=$3 AND sn.is_active=TRUE`,
        [device.gateway_id, event.evidence.node_id, device.farmer_id],
      );
      if (!owned.rows.length)
        fail(404, "An active node assigned to this gateway was not found.");
      await pool.query(
        `INSERT INTO gateway_event(gateway_id,source_event_id,payload_hash,evidence,is_simulation) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(gateway_id,source_event_id) DO NOTHING`,
        [
          device.gateway_id,
          event.evidence.source_event_id,
          event.payloadHash,
          event.evidence,
          device.is_simulation,
        ],
      );
      const result = await transaction(pool, async (client) => {
        const active = (
          await client.query(
            "SELECT 1 FROM device_gateway WHERE gateway_id=$1 AND key_hash=$2 AND is_active=TRUE FOR SHARE",
            [device.gateway_id, device.key_hash],
          )
        ).rows.length;
        if (!active) fail(401, "The Raspberry Pi credential was revoked.");
        const receipt = (
          await client.query(
            "SELECT * FROM gateway_event WHERE gateway_id=$1 AND source_event_id=$2 FOR UPDATE",
            [device.gateway_id, event.evidence.source_event_id],
          )
        ).rows[0];
        if (receipt.payload_hash !== event.payloadHash)
          fail(409, "This event ID was already used with different content.");
        if (receipt.state === "COMPLETED")
          return {
            duplicate: true,
            detection_id: receipt.detection_id,
            notification_id: receipt.notification_id,
            push_jobs_created: 0,
          };
        const node = (
          await client.query(
            `SELECT sn.node_id,sn.node_name,fp.farmer_id FROM gateway_node gn JOIN sensor_node sn ON sn.node_id=gn.node_id JOIN farm_plot fp ON fp.plot_id=sn.plot_id
        WHERE gn.gateway_id=$1 AND gn.node_id=$2 AND fp.farmer_id=$3 AND sn.is_active=TRUE FOR SHARE OF gn,sn,fp`,
            [device.gateway_id, event.evidence.node_id, device.farmer_id],
          )
        ).rows[0];
        if (!node)
          fail(404, "An active node assigned to this gateway was not found.");
        const images = [];
        for (const image of event.images)
          images.push({
            ...(await storage.upload({
              farmerId: device.farmer_id,
              gatewayId: device.gateway_id,
              eventId: event.evidence.source_event_id,
              image,
            })),
            image,
          });
        const vibration = event.evidence.vibration;
        const reading = (
          await client.query(
            "INSERT INTO sensor_reading(node_id,amplitude,frequency,duration,amplitude_unit,recorded_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING reading_id",
            [
              node.node_id,
              vibration.amplitude,
              vibration.frequency_hz,
              vibration.duration_seconds,
              vibration.amplitude_unit,
              event.evidence.occurred_at,
            ],
          )
        ).rows[0];
        const detection = (
          await client.query(
            "INSERT INTO detection(reading_id,prediction,confidence,verify_required,detection_status,detection_at) VALUES ($1,'DURIAN',$2,FALSE,'VERIFIED',$3) RETURNING detection_id",
            [
              reading.reading_id,
              event.evidence.camera.confidence,
              event.evidence.occurred_at,
            ],
          )
        ).rows[0];
        for (const saved of images)
          await client.query(
            "INSERT INTO detection_image(detection_id,image_path,storage_bucket,storage_path,content_sha256,sequence_number,is_selected,captured_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              detection.detection_id,
              saved.path,
              saved.bucket,
              saved.path,
              saved.sha256,
              saved.image.sequence_number,
              saved.image.sequence_number === event.images[0].sequence_number,
              saved.image.captured_at,
            ],
          );
        const notification = (
          await client.query(
            "INSERT INTO notification(detection_id,farmer_id,title,message_noti) VALUES ($1,$2,$3,$4) RETURNING notification_id",
            [
              detection.detection_id,
              device.farmer_id,
              device.is_simulation
                ? "Simulated harvest event"
                : "Confirmed harvest event",
              `${device.is_simulation ? "Simulation · " : ""}${node.node_name} · reported ${event.evidence.occurred_at}. Open the event to review its evidence.`,
            ],
          )
        ).rows[0];
        const pushJobs = await enqueueNotification(
          client,
          notification.notification_id,
          device.farmer_id,
        );
        await client.query(
          "UPDATE gateway_event SET state='COMPLETED',detection_id=$3,notification_id=$4 WHERE gateway_id=$1 AND source_event_id=$2",
          [
            device.gateway_id,
            event.evidence.source_event_id,
            detection.detection_id,
            notification.notification_id,
          ],
        );
        return {
          duplicate: false,
          detection_id: detection.detection_id,
          notification_id: notification.notification_id,
          push_jobs_created: pushJobs,
        };
      });
      console.info(
        "Processed Pi event:",
        device.gateway_id,
        event.evidence.source_event_id,
        result.duplicate ? "RETRY" : "CREATED",
      );
      res
        .status(result.duplicate ? 200 : 201)
        .set("Cache-Control", "no-store")
        .json({
          ...result,
          source_event_id: event.evidence.source_event_id,
          simulation: device.is_simulation,
          push_delivery: "asynchronous",
        });
    }),
  );
  return router;
}
module.exports = { createProcessedEventRoutes };
