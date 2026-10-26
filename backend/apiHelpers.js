const id = (value) =>
  typeof value === "string" &&
  /^[1-9]\d{0,18}$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;
function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function requireId(value) {
  if (!id(value)) fail(400, "Invalid record ID.");
  return value;
}
function text(value, label, max, optional = false) {
  if ((value === undefined || value === null) && optional) return null;
  if (
    typeof value !== "string" ||
    (!optional && !value.trim()) ||
    value.trim().length > max
  )
    fail(
      400,
      `${label} must contain ${optional ? "0" : "1"}–${max} characters.`,
    );
  return value.trim() || null;
}
function number(value, label, minimum, maximum) {
  if (
    !["number", "string"].includes(typeof value) ||
    String(value).trim() === "" ||
    !Number.isFinite(Number(value)) ||
    Number(value) < minimum ||
    Number(value) > maximum
  )
    fail(400, `${label} must be between ${minimum} and ${maximum}.`);
  return Number(value);
}
const route = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    if (error.code === "23505")
      return res
        .status(409)
        .json({ error: "A record with this name already exists." });
    if (error.code === "23503")
      return res.status(409).json({
        error: "This record has related history. Refresh before trying again.",
      });
    console.error("API operation failed:", error.code || "UNKNOWN");
    res.status(503).json({
      error: "The operation could not be completed. Please try again.",
    });
  }
};
async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
async function ownPlot(client, plotId, farmerId, lock = false) {
  requireId(plotId);
  const { rows } = await client.query(
    `SELECT * FROM farm_plot WHERE plot_id=$1 AND farmer_id=$2${lock ? " FOR UPDATE" : ""}`,
    [plotId, farmerId],
  );
  if (!rows.length) fail(404, "Plot not found.");
  return rows[0];
}
module.exports = {
  id,
  requireId,
  text,
  number,
  fail,
  route,
  transaction,
  ownPlot,
};
