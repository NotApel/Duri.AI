const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const { createHash, randomBytes } = require("node:crypto");
const { createResetMailer, ResetDeliveryError } = require("./resetMailer");
const requestMessage =
  "If an account matches that email, check its inbox and spam folder for a reset link.";
const invalidLinkMessage =
  "This reset link is invalid or expired. Please request a new link.";
function passwordError(password) {
  return typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
    ? "Password must contain at least 8 characters and at most 72 UTF-8 bytes."
    : null;
}
function createPasswordRecovery(
  pool,
  { sendResetEmail = createResetMailer() } = {},
) {
  const router = Router();
  const limiter = (limit) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error:
          "Too many password recovery attempts. Please try again after 15 minutes.",
      },
    });
  router.post("/forgot-password", limiter(10), async (req, res) => {
    const email = req.body?.email;
    if (
      typeof email !== "string" ||
      email.trim().length > 200 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    )
      return res.status(400).json({ error: "Enter a valid email address." });
    if (!sendResetEmail)
      return res.status(503).json({
        error:
          "Password recovery email is not configured. Please contact your administrator.",
      });
    // Acknowledge before lookup/SMTP so account existence cannot be inferred
    // from email delivery time. Acceptance does not claim inbox delivery.
    res.status(202).json({ message: requestMessage });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      // All login/reset operations lock the farmer first to avoid deadlocks and
      // prevent old-password logins from finishing after a reset revokes sessions.
      const result = await client.query(
        "SELECT farmer_id,email FROM farmer WHERE lower(email) = lower($1) FOR UPDATE",
        [email.trim()],
      );
      const farmer = result.rows[0];
      if (farmer) {
        const recent = await client.query(
          "SELECT 1 FROM farmer_password_reset WHERE farmer_id=$1 AND created_at > NOW() - INTERVAL '60 seconds' AND expires_at > NOW()",
          [farmer.farmer_id],
        );
        if (!recent.rows.length) {
          const token = randomBytes(32).toString("hex");
          const digest = createHash("sha256").update(token).digest("hex");
          await client.query(
            `INSERT INTO farmer_password_reset (farmer_id,token_hash,expires_at) VALUES ($1,$2,NOW() + INTERVAL '15 minutes') ON CONFLICT (farmer_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,created_at=NOW(),expires_at=EXCLUDED.expires_at`,
            [farmer.farmer_id, digest],
          );
          // Roll back if SMTP fails: an earlier delivered link remains usable.
          await sendResetEmail(farmer.email, token);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ResetDeliveryError) {
        // Never disclose account existence, recipient addresses or reset tokens.
        console.error(
          "Password reset email could not be delivered.",
          error.cause?.code || "SMTP_ERROR",
        );
      } else {
        console.error(
          "Password recovery request could not be processed.",
          error.code || "DATABASE_ERROR",
        );
      }
    } finally {
      client?.release();
      console.info("Password recovery request processed.");
    }
  });
  router.post("/reset-password", limiter(20), async (req, res) => {
    const { token, new_password: password } = req.body || {};
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
      return res.status(400).json({ error: invalidLinkMessage });
    const error = passwordError(password);
    if (error) return res.status(400).json({ error });
    let client;
    try {
      const digest = createHash("sha256").update(token).digest("hex");
      // Hash before taking row locks; one-use enforcement remains transactional.
      const passwordHash = await bcrypt.hash(password, 10);
      client = await pool.connect();
      await client.query("BEGIN");
      const lookup = await client.query(
        "SELECT farmer_id FROM farmer_password_reset WHERE token_hash=$1",
        [digest],
      );
      const farmerId = lookup.rows[0]?.farmer_id;
      if (farmerId)
        await client.query(
          "SELECT farmer_id FROM farmer WHERE farmer_id=$1 FOR UPDATE",
          [farmerId],
        );
      const consumed = farmerId
        ? await client.query(
            "DELETE FROM farmer_password_reset WHERE farmer_id=$1 AND token_hash=$2 AND expires_at>clock_timestamp() RETURNING farmer_id",
            [farmerId, digest],
          )
        : { rows: [] };
      if (!consumed.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: invalidLinkMessage });
      }
      await client.query(
        "UPDATE farmer SET password_hash=$1,updated_at=NOW() WHERE farmer_id=$2",
        [passwordHash, farmerId],
      );
      await client.query("DELETE FROM farmer_session WHERE farmer_id=$1", [
        farmerId,
      ]);
      await client.query("COMMIT");
      return res.json({
        message:
          "Your password has been reset. Please log in with your new password.",
      });
    } catch {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return res.status(503).json({
        error: "Your password could not be reset. Please try again later.",
      });
    } finally {
      client?.release();
    }
  });
  return router;
}
module.exports = { createPasswordRecovery, passwordError };
