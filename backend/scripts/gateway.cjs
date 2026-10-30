// Operator-only provisioning. Credentials are printed once, never stored in source.
const { parseArgs } = require("node:util");
const path = require("node:path");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  quiet: true,
});
const { uuidPattern } = require("../eventValidation");
const { provisionGateway, credential } = require("../deviceAuth");
const { transaction, requireId, fail } = require("../apiHelpers");
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "farmer-id": { type: "string" },
      "gateway-id": { type: "string" },
      "node-ids": { type: "string" },
      name: { type: "string" },
      simulation: { type: "boolean", default: false },
    },
  });
  const action = positionals[0];
  if (!["create", "rotate", "revoke", "assign"].includes(action))
    throw new Error(
      "Usage: gateway.cjs create|rotate|revoke|assign --farmer-id ID --gateway-id UUID --node-ids 1,2 --name Name [--simulation]",
    );
  const pool = require("../db");
  try {
    if (action === "create") {
      const result = await provisionGateway(pool, {
        farmerId: values["farmer-id"],
        name: values.name,
        nodeIds: values["node-ids"]?.split(","),
        isSimulation: values.simulation,
      });
      console.log(
        JSON.stringify(
          {
            ...result,
            simulation: values.simulation,
            note: "Store this credential securely on the Raspberry Pi. It will not be displayed again.",
          },
          null,
          2,
        ),
      );
      return;
    }
    const id = values["gateway-id"];
    if (!uuidPattern.test(id || ""))
      fail(400, "A valid gateway ID is required.");
    const result = await transaction(pool, async (client) => {
      const gateway = (
        await client.query(
          "SELECT * FROM device_gateway WHERE gateway_id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!gateway) fail(404, "Gateway not found.");
      if (action === "revoke") {
        await client.query(
          "UPDATE device_gateway SET is_active=FALSE WHERE gateway_id=$1",
          [id],
        );
        return { gateway_id: id, revoked: true };
      }
      if (action === "rotate") {
        const key = credential(id);
        await client.query(
          "UPDATE device_gateway SET key_hash=$1,is_active=TRUE WHERE gateway_id=$2",
          [key.hash, id],
        );
        return { gateway_id: id, credential: key.token };
      }
      const nodes = values["node-ids"]?.split(",");
      if (!nodes?.length) fail(400, "Node IDs are required.");
      nodes.forEach(requireId);
      for (const node of nodes) {
        const owned = (
          await client.query(
            "SELECT sn.node_id FROM sensor_node sn JOIN farm_plot fp ON fp.plot_id=sn.plot_id WHERE sn.node_id=$1 AND fp.farmer_id=$2 FOR UPDATE OF sn",
            [node, gateway.farmer_id],
          )
        ).rows.length;
        if (!owned) fail(404, "Owned node not found.");
        await client.query(
          "INSERT INTO gateway_node(gateway_id,node_id) VALUES ($1,$2) ON CONFLICT(gateway_id,node_id) DO NOTHING",
          [id, node],
        );
      }
      return { gateway_id: id, assigned_node_ids: nodes };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error("Gateway operation failed:", error.code || error.message);
  process.exitCode = 1;
});
