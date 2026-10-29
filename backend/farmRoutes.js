const { Router } = require("express");
const {
  requireId,
  text,
  number,
  fail,
  route,
  transaction,
  ownPlot,
} = require("./apiHelpers");
function createFarmRoutes(pool, authenticate, deviceAuth) {
  const router = Router();
  const configured = Number(process.env.NODE_OFFLINE_AFTER_SECONDS || 300);
  const offlineAfter =
    Number.isFinite(configured) && configured > 0 ? configured : 300;
  function report(row) {
    const age = row.last_ping_at
      ? Date.now() - new Date(row.last_ping_at).getTime()
      : Infinity;
    return {
      ...row,
      status:
        row.is_active &&
        row.status === "ONLINE" &&
        age >= 0 &&
        age <= offlineAfter * 1000
          ? "ONLINE"
          : "OFFLINE",
    };
  }
  const paths = ["/farmer/:farmerId/farm-plot", "/farmers/:farmerId/plots"];
  router.get(
    paths,
    authenticate,
    route(async (req, res) => {
      requireId(req.params.farmerId);
      if (req.params.farmerId !== String(req.farmer.id))
        fail(403, "Access denied.");
      res.json(
        (
          await pool.query(
            "SELECT * FROM farm_plot WHERE farmer_id=$1 ORDER BY plot_name,plot_id",
            [req.farmer.id],
          )
        ).rows,
      );
    }),
  );
  function plotValues(body) {
    return [
      text(body.farm_name, "Farm name", 200),
      text(body.plot_name, "Plot name", 200),
      number(body.plot_size, "Plot size (hectares)", 0.01, 999999.99),
    ];
  }
  router.post(
    paths,
    authenticate,
    route(async (req, res) => {
      requireId(req.params.farmerId);
      if (req.params.farmerId !== String(req.farmer.id))
        fail(403, "Access denied.");
      const values = plotValues(req.body || {});
      const result = await pool.query(
        "INSERT INTO farm_plot (farmer_id,farm_name,plot_name,plot_size) VALUES ($1,$2,$3,$4) RETURNING *",
        [req.farmer.id, ...values],
      );
      res.status(201).json(result.rows[0]);
    }),
  );
  router.patch(
    "/plots/:plotId",
    authenticate,
    route(async (req, res) => {
      const values = plotValues(req.body || {});
      const result = await transaction(pool, async (client) => {
        await ownPlot(client, req.params.plotId, req.farmer.id, true);
        return (
          await client.query(
            "UPDATE farm_plot SET farm_name=$1,plot_name=$2,plot_size=$3,updated_at=NOW() WHERE plot_id=$4 RETURNING *",
            [...values, req.params.plotId],
          )
        ).rows[0];
      });
      res.json(result);
    }),
  );
  router.delete(
    "/plots/:plotId",
    authenticate,
    route(async (req, res) => {
      await transaction(pool, async (client) => {
        await ownPlot(client, req.params.plotId, req.farmer.id, true);
        if (
          (
            await client.query(
              "SELECT 1 FROM sensor_node WHERE plot_id=$1 LIMIT 1",
              [req.params.plotId],
            )
          ).rows.length
        )
          fail(
            409,
            "Cannot delete a plot with registered nodes. Remove its unused nodes first.",
          );
        await client.query("DELETE FROM farm_plot WHERE plot_id=$1", [
          req.params.plotId,
        ]);
      });
      res.json({ message: "Plot deleted." });
    }),
  );
  router.get(
    "/plots/:plotId/nodes",
    authenticate,
    route(async (req, res) => {
      await ownPlot(pool, req.params.plotId, req.farmer.id);
      res.json(
        (
          await pool.query(
            "SELECT * FROM sensor_node WHERE plot_id=$1 ORDER BY node_name,node_id",
            [req.params.plotId],
          )
        ).rows.map(report),
      );
    }),
  );
  router.get(
    "/nodes",
    authenticate,
    route(async (req, res) => {
      const result = await pool.query(
        "SELECT sn.*,fp.plot_name FROM sensor_node sn JOIN farm_plot fp ON fp.plot_id=sn.plot_id WHERE fp.farmer_id=$1 ORDER BY sn.node_name,sn.node_id",
        [req.farmer.id],
      );
      res.json(result.rows.map(report));
    }),
  );
  function nodeValues(body) {
    return [
      text(body.node_name, "Node name", 50),
      text(body.firmware_version, "Firmware version", 20, true),
    ];
  }
  router.post(
    "/plots/:plotId/nodes",
    authenticate,
    route(async (req, res) => {
      const values = nodeValues(req.body || {});
      const node = await transaction(pool, async (client) => {
        await ownPlot(client, req.params.plotId, req.farmer.id, true);
        return (
          await client.query(
            "INSERT INTO sensor_node (plot_id,node_name,firmware_version,status,battery_level,last_ping_at) VALUES ($1,$2,$3,'OFFLINE',NULL,NULL) RETURNING *",
            [req.params.plotId, ...values],
          )
        ).rows[0];
      });
      res.status(201).json(report(node));
    }),
  );
  async function ownNode(client, nodeId, farmerId) {
    requireId(nodeId);
    const result = await client.query(
      "SELECT sn.* FROM sensor_node sn JOIN farm_plot fp ON fp.plot_id=sn.plot_id WHERE sn.node_id=$1 AND fp.farmer_id=$2 FOR UPDATE OF sn",
      [nodeId, farmerId],
    );
    if (!result.rows.length) fail(404, "Node not found.");
    return result.rows[0];
  }
  router.patch(
    "/nodes/:nodeId",
    authenticate,
    route(async (req, res) => {
      const body = req.body || {};
      const values = nodeValues(body);
      if (body.is_active !== undefined && typeof body.is_active !== "boolean")
        fail(400, "Active state must be a boolean.");
      const node = await transaction(pool, async (client) => {
        const previous = await ownNode(
          client,
          req.params.nodeId,
          req.farmer.id,
        );
        const plotId =
          body.plot_id === undefined
            ? previous.plot_id
            : requireId(body.plot_id);
        await ownPlot(client, plotId, req.farmer.id, true);
        if (
          plotId !== previous.plot_id &&
          (
            await client.query(
              "SELECT 1 FROM sensor_reading WHERE node_id=$1 LIMIT 1",
              [previous.node_id],
            )
          ).rows.length
        )
          fail(
            409,
            "This node has sensor history and cannot be reassigned. Register a new node to preserve its history.",
          );
        return (
          await client.query(
            "UPDATE sensor_node SET plot_id=$1,node_name=$2,firmware_version=$3,is_active=$4 WHERE node_id=$5 RETURNING *",
            [
              plotId,
              ...values,
              body.is_active ?? previous.is_active,
              previous.node_id,
            ],
          )
        ).rows[0];
      });
      res.json(report(node));
    }),
  );
  router.delete(
    "/nodes/:nodeId",
    authenticate,
    route(async (req, res) => {
      await transaction(pool, async (client) => {
        const node = await ownNode(client, req.params.nodeId, req.farmer.id);
        if (
          (
            await client.query(
              "SELECT 1 FROM sensor_reading WHERE node_id=$1 LIMIT 1",
              [node.node_id],
            )
          ).rows.length
        )
          fail(
            409,
            "Cannot delete a node with sensor history. Disable it instead.",
          );
        await client.query("DELETE FROM sensor_node WHERE node_id=$1", [
          node.node_id,
        ]);
      });
      res.json({ message: "Node deleted." });
    }),
  );
  // Device reports are the only source of node coordinates and connection telemetry.
  router.post(
    "/device/nodes/:nodeId/heartbeat",
    deviceAuth,
    route(async (req, res) => {
      requireId(req.params.nodeId);
      const body = req.body || {};
      const hasLocation =
        body.latitude !== undefined || body.longitude !== undefined;
      const latitude = hasLocation
        ? number(body.latitude, "Latitude", -90, 90)
        : null;
      const longitude = hasLocation
        ? number(body.longitude, "Longitude", -180, 180)
        : null;
      const battery =
        body.battery_level === undefined || body.battery_level === null
          ? null
          : number(body.battery_level, "Battery", 0, 100);
      if (battery !== null && !Number.isInteger(battery))
        fail(400, "Battery must be an integer percentage.");
      const result = await pool.query(
        `UPDATE sensor_node SET status='ONLINE',last_ping_at=NOW(),battery_level=$1,
      latitude=CASE WHEN $2 THEN $3 ELSE latitude END,longitude=CASE WHEN $2 THEN $4 ELSE longitude END,
      location_recorded_at=CASE WHEN $2 THEN NOW() ELSE location_recorded_at END
      WHERE node_id=$5 AND is_active=TRUE RETURNING *`,
        [battery, hasLocation, latitude, longitude, req.params.nodeId],
      );
      if (!result.rows.length) fail(404, "Active node not found.");
      res.json(report(result.rows[0]));
    }),
  );
  return router;
}
module.exports = { createFarmRoutes };
