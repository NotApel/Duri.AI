const { randomUUID, randomBytes, timingSafeEqual } = require("node:crypto");
const { digest } = require("./eventValidation");
const { transaction, requireId, fail, text } = require("./apiHelpers");
function credential(gatewayId) {
  const secret = randomBytes(32).toString("hex");
  return { token: `duri_pi_${gatewayId}.${secret}`, hash: digest(secret) };
}
async function provisionGateway(
  pool,
  { farmerId, name, nodeIds, isSimulation = false },
) {
  requireId(farmerId);
  if (
    !Array.isArray(nodeIds) ||
    !nodeIds.length ||
    new Set(nodeIds).size !== nodeIds.length
  )
    fail(400, "Assign at least one unique owned node.");
  nodeIds.forEach(requireId);
  const gatewayId = randomUUID(),
    key = credential(gatewayId);
  await transaction(pool, async (client) => {
    const owned = await client.query(
      "SELECT sn.node_id FROM sensor_node sn JOIN farm_plot fp ON fp.plot_id=sn.plot_id WHERE sn.node_id=ANY($1::bigint[]) AND fp.farmer_id=$2 ORDER BY sn.node_id FOR UPDATE OF sn",
      [nodeIds, farmerId],
    );
    if (owned.rows.length !== nodeIds.length)
      fail(404, "One or more owned nodes were not found.");
    await client.query(
      "INSERT INTO device_gateway(gateway_id,farmer_id,name,key_hash,is_simulation) VALUES ($1,$2,$3,$4,$5)",
      [
        gatewayId,
        farmerId,
        text(name, "Gateway name", 100),
        key.hash,
        isSimulation,
      ],
    );
    for (const nodeId of nodeIds)
      await client.query(
        "INSERT INTO gateway_node(gateway_id,node_id) VALUES ($1,$2)",
        [gatewayId, nodeId],
      );
  });
  return { gateway_id: gatewayId, credential: key.token };
}
function createDeviceAuth(pool) {
  return async (req, res, next) => {
    const match = /^Bearer duri_pi_([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(
      req.headers.authorization || "",
    );
    if (
      !match ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        match[1],
      )
    )
      return res
        .status(401)
        .json({ error: "A valid Raspberry Pi credential is required." });
    try {
      const gateway = (
        await pool.query(
          "SELECT * FROM device_gateway WHERE gateway_id=$1 AND is_active=TRUE",
          [match[1]],
        )
      ).rows[0];
      const expected = Buffer.from(gateway?.key_hash || "0".repeat(64), "hex");
      if (
        !timingSafeEqual(expected, Buffer.from(digest(match[2]), "hex")) ||
        !gateway
      )
        return res
          .status(401)
          .json({ error: "Invalid or revoked Raspberry Pi credential." });
      req.device = gateway;
      next();
    } catch {
      res
        .status(503)
        .json({ error: "Device authorization is unavailable. Please retry." });
    }
  };
}
module.exports = { createDeviceAuth, provisionGateway, credential };
