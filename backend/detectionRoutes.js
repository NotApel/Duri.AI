const { Router } = require("express");
const { Buffer } = require("node:buffer");
const { mkdir, writeFile, unlink } = require("node:fs/promises");
const path = require("node:path");
const {
  id,
  requireId,
  text,
  fail,
  route,
  transaction,
} = require("./apiHelpers");
const evidence = `SELECT d.*,to_char(d.detection_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,sn.node_id,sn.node_name,sn.plot_id,fp.plot_name,
  sr.amplitude,sr.amplitude_unit,sr.frequency,sr.duration,
  COALESCE((SELECT ge.is_simulation FROM gateway_event ge WHERE ge.detection_id=d.detection_id),FALSE) AS is_simulation,
  sn.latitude AS node_latitude,sn.longitude AS node_longitude,sn.location_recorded_at,
  COALESCE((SELECT json_agg(json_build_object('image_id',di.image_id::text,'detection_id',di.detection_id::text,'image_path',di.image_path,'storage_bucket',di.storage_bucket,'storage_path',di.storage_path,'sequence_number',di.sequence_number,'is_selected',di.is_selected) ORDER BY di.sequence_number,di.image_id) FROM detection_image di WHERE di.detection_id=d.detection_id),'[]') AS images,
  (SELECT row_to_json(f) FROM (SELECT df.feedback_id::text,df.category_id::text,df.correct_detection,df.comment_farmer,df.feedback_at,df.storage_bucket,df.storage_path,fc.category_name FROM detection_feedback df LEFT JOIN feedback_category fc ON fc.category_id=df.category_id
    WHERE df.detection_id=d.detection_id AND df.farmer_id=fp.farmer_id ORDER BY df.feedback_at DESC,df.feedback_id DESC LIMIT 1) f) AS farmer_feedback
  FROM detection d JOIN sensor_reading sr ON sr.reading_id=d.reading_id
  JOIN sensor_node sn ON sn.node_id=sr.node_id JOIN farm_plot fp ON fp.plot_id=sn.plot_id`;
function createDetectionRoutes(
  pool,
  authenticate,
  storage = require("./storage").createStorage(),
) {
  const signed = async (row, farmerId) => ({
    ...row,
    images: await storage.signRows(row.images, farmerId),
    farmer_feedback: row.farmer_feedback?.storage_path
      ? (await storage.signRows([row.farmer_feedback], farmerId))[0]
      : row.farmer_feedback,
  });
  const router = Router();
  router.use(["/detections", "/detection"], authenticate, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get(
    ["/detections", "/detection"],
    route(async (req, res) => {
      const paginated =
        req.query.limit !== undefined ||
        req.query.cursor !== undefined ||
        req.query.prediction !== undefined;
      const limit =
        req.query.limit === undefined ? 20 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        fail(400, "Limit must be between 1 and 100.");
      const values = [req.farmer.id];
      let where = " WHERE fp.farmer_id=$1";
      if (req.query.prediction !== undefined && req.query.prediction !== "") {
        if (!["DURIAN", "NOT_DURIAN"].includes(req.query.prediction))
          fail(400, "Invalid detection type.");
        values.push(req.query.prediction);
        where += ` AND d.prediction=$${values.length}`;
      }
      if (req.query.cursor !== undefined) {
        let cursor;
        try {
          if (
            typeof req.query.cursor !== "string" ||
            req.query.cursor.length > 256
          )
            throw new Error();
          cursor = JSON.parse(
            Buffer.from(req.query.cursor, "base64url").toString("utf8"),
          );
          if (
            !Array.isArray(cursor) ||
            cursor.length !== 2 ||
            typeof cursor[0] !== "string" ||
            !Number.isFinite(Date.parse(cursor[0])) ||
            !id(cursor[1])
          )
            throw new Error();
        } catch {
          fail(400, "Invalid history cursor. Refresh the history.");
        }
        values.push(cursor[0], cursor[1]);
        where += ` AND (d.detection_at,d.detection_id)<($${values.length - 1}::timestamptz,$${values.length}::bigint)`;
      }
      values.push(limit + 1);
      const result = await pool.query(
        evidence +
          where +
          ` ORDER BY d.detection_at DESC,d.detection_id DESC LIMIT $${values.length}`,
        values,
      );
      const items = result.rows.slice(0, limit);
      const resolved = await Promise.all(
        items.map((row) => signed(row, req.farmer.id)),
      );
      if (!paginated) return res.json(resolved);
      const last = items.at(-1);
      const next_cursor =
        result.rows.length > limit && last
          ? Buffer.from(
              JSON.stringify([last.cursor_time, last.detection_id]),
            ).toString("base64url")
          : null;
      res.json({ items: resolved, next_cursor });
    }),
  );
  router.get(
    ["/detections/:detectionId", "/detection/:detectionId"],
    route(async (req, res) => {
      requireId(req.params.detectionId);
      const { rows } = await pool.query(
        evidence + " WHERE fp.farmer_id=$1 AND d.detection_id=$2",
        [req.farmer.id, req.params.detectionId],
      );
      if (!rows.length) fail(404, "Detection not found.");
      res.json(await signed(rows[0], req.farmer.id));
    }),
  );
  router.get(
    [
      "/detections/:detectionId/images",
      "/detection/:detectionId/detection-image",
    ],
    route(async (req, res) => {
      requireId(req.params.detectionId);
      const owned = await pool.query(
        "SELECT 1 FROM detection d JOIN sensor_reading sr ON sr.reading_id=d.reading_id JOIN sensor_node sn ON sn.node_id=sr.node_id JOIN farm_plot fp ON fp.plot_id=sn.plot_id WHERE d.detection_id=$1 AND fp.farmer_id=$2",
        [req.params.detectionId, req.farmer.id],
      );
      if (!owned.rows.length) fail(404, "Detection not found.");
      const images = (
        await pool.query(
          "SELECT * FROM detection_image WHERE detection_id=$1 ORDER BY sequence_number,image_id",
          [req.params.detectionId],
        )
      ).rows;
      const result = await storage.signRows(images, req.farmer.id);
      if (result.some((row) => row.image_error))
        fail(503, "Image access is temporarily unavailable. Please retry.");
      res.json(result);
    }),
  );
  // Keep the dedicated feedback endpoint introduced on feature/seed-data.
  router.get(
    [
      "/detections/:detectionId/feedback",
      "/detection/:detectionId/detection-feedback",
    ],
    route(async (req, res) => {
      requireId(req.params.detectionId);
      const { rows } = await pool.query(
        evidence + " WHERE fp.farmer_id=$1 AND d.detection_id=$2",
        [req.farmer.id, req.params.detectionId],
      );
      if (!rows.length) fail(404, "Detection not found.");
      if (!rows[0].farmer_feedback)
        fail(404, "No feedback found for this detection.");
      res.json({
        ...(await signed(rows[0], req.farmer.id)).farmer_feedback,
        detection_id: req.params.detectionId,
        farmer_id: String(req.farmer.id),
      });
    }),
  );
  router.post(
    [
      "/detections/:detectionId/feedback",
      "/detection/:detectionId/detection-feedback",
    ],
    route(async (req, res) => {
      requireId(req.params.detectionId);
      const body = req.body || {};
      if (typeof body.correct_detection !== "boolean")
        fail(400, "Choose Durian or No Durian.");
      if (
        body.farmer_id !== undefined &&
        String(body.farmer_id) !== String(req.farmer.id)
      )
        fail(403, "Access denied.");
      const categoryId =
        body.category_id === undefined ||
        body.category_id === null ||
        body.category_id === ""
          ? null
          : requireId(String(body.category_id));
      if (!body.correct_detection && !categoryId)
        fail(400, "Category is required for No Durian.");
      const comment = text(body.comment_farmer, "Comment", 500, true);
      let image, imagePath;
      if (body.image_base64 !== undefined && body.image_base64 !== null) {
        if (
          typeof body.image_base64 !== "string" ||
          body.image_base64.length > 7 * 1024 * 1024
        )
          fail(400, "Choose a JPEG or PNG image no larger than 5 MB.");
        const match =
          /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
            body.image_base64,
          );
        if (!match) fail(400, "Invalid feedback image.");
        image = Buffer.from(match[2], "base64");
        const valid =
          match[1] === "png"
            ? image
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : image[0] === 255 && image[1] === 216 && image[2] === 255;
        if (!valid || image.length > 5 * 1024 * 1024)
          fail(400, "Invalid feedback image.");
      }
      let result;
      try {
        result = await transaction(pool, async (client) => {
          const owned = await client.query(
            "SELECT d.detection_id FROM detection d JOIN sensor_reading sr ON sr.reading_id=d.reading_id JOIN sensor_node sn ON sn.node_id=sr.node_id JOIN farm_plot fp ON fp.plot_id=sn.plot_id WHERE d.detection_id=$1 AND fp.farmer_id=$2 FOR UPDATE OF d",
            [req.params.detectionId, req.farmer.id],
          );
          if (!owned.rows.length) fail(404, "Detection not found.");
          if (
            categoryId &&
            !(
              await client.query(
                "SELECT 1 FROM feedback_category WHERE category_id=$1",
                [categoryId],
              )
            ).rows.length
          )
            fail(400, "Choose an available feedback category.");
          if (
            (
              await client.query(
                "SELECT 1 FROM detection_feedback WHERE detection_id=$1 AND farmer_id=$2 LIMIT 1",
                [req.params.detectionId, req.farmer.id],
              )
            ).rows.length
          )
            fail(
              409,
              "Feedback was already submitted. Refresh to see the saved assessment.",
            );
          const saved = (
            await client.query(
              "INSERT INTO detection_feedback (detection_id,farmer_id,category_id,correct_detection,comment_farmer) VALUES ($1,$2,$3,$4,$5) RETURNING *",
              [
                req.params.detectionId,
                req.farmer.id,
                categoryId,
                body.correct_detection,
                comment,
              ],
            )
          ).rows[0];
          await client.query(
            "UPDATE detection SET detection_status=$1 WHERE detection_id=$2",
            [
              body.correct_detection ? "VERIFIED" : "REJECTED",
              req.params.detectionId,
            ],
          );
          await client.query(
            "INSERT INTO training_queue (feedback_id,queue_status) VALUES ($1,'PENDING')",
            [saved.feedback_id],
          );
          if (image && storage.configured) {
            const decoded = require("./eventValidation").decodeImage(
              {
                content_type: image[0] === 137 ? "image/png" : "image/jpeg",
                data_base64: image.toString("base64"),
                captured_at: new Date().toISOString(),
              },
              0,
            );
            const object = await storage.upload({
              farmerId: req.farmer.id,
              gatewayId: "feedback",
              eventId: req.params.detectionId,
              image: decoded,
            });
            await client.query(
              "UPDATE detection_feedback SET storage_bucket=$1,storage_path=$2,content_sha256=$3 WHERE feedback_id=$4",
              [object.bucket, object.path, object.sha256, saved.feedback_id],
            );
          } else if (image) {
            const dir = path.join(__dirname, "feedback_images");
            await mkdir(dir, { recursive: true });
            imagePath = path.join(
              dir,
              `feedback_${req.params.detectionId}.${image[0] === 137 ? "png" : "jpg"}`,
            );
            await writeFile(imagePath, image, { flag: "wx" });
          }
          return saved;
        });
      } catch (error) {
        if (imagePath) await unlink(imagePath).catch(() => {});
        throw error;
      }
      res.status(201).json(result);
    }),
  );
  return router;
}
module.exports = { createDetectionRoutes };
