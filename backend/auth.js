const { Router } = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const {
  createHash,
  randomBytes,
  scrypt: scryptCallback,
  timingSafeEqual,
} = require("node:crypto");
const { promisify } = require("node:util");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const createAuthMiddleware = require("./middleware/auth");
const scrypt = promisify(scryptCallback);
const publicColumns =
  "farmer_id, full_name, username, email, phone_number, created_at, updated_at";
const recoveryMessage =
  "Password recovery is not connected. Please contact your administrator.";

async function migrateAuth(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(53918, 1)");
    for (const filename of [
      "000_farmer_username.sql",
      "001_auth_sessions.sql",
    ]) {
      const sql = await readFile(
        path.join(__dirname, "migrations", filename),
        "utf8",
      );
      await client.query(sql);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
function registrationError(body) {
  if (
    !body ||
    ![
      body.full_name,
      body.username,
      body.email,
      body.password,
      body.phone_number,
    ].every((value) => typeof value === "string" && value.trim())
  )
    return "All fields are required.";
  if (body.full_name.trim().length > 200)
    return "Full name must be 200 characters or fewer.";
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(body.username.trim()))
    return "Username must be 3–50 letters, numbers, dots, underscores or hyphens.";
  if (
    body.email.trim().length > 200 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
  )
    return "Enter a valid email address.";
  if (body.password.length < 8 || Buffer.byteLength(body.password, "utf8") > 72)
    return "Password must contain at least 8 characters and at most 72 UTF-8 bytes.";
  if (
    body.phone_number.trim().length > 20 ||
    !/^[+\d\s()-]+$/.test(body.phone_number.trim()) ||
    body.phone_number.replace(/\D/g, "").length < 7
  )
    return "Enter a valid phone number.";
  return null;
}
async function verifyPassword(password, stored) {
  if (/^\$2[aby]\$\d\d\$/.test(stored || ""))
    return (
      Buffer.byteLength(password, "utf8") <= 72 &&
      bcrypt.compare(password, stored)
    );
  // Keep compatibility with accounts created by the earlier session module.
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored || "");
  const derived = await scrypt(password, match ? match[1] : "0".repeat(32), 64);
  return (
    Boolean(match) && timingSafeEqual(derived, Buffer.from(match[2], "hex"))
  );
}
function createAuth(
  pool,
  {
    jwtSecret = process.env.JWT_SECRET,
    authenticate = createAuthMiddleware(pool, { jwtSecret }),
  } = {},
) {
  if (!jwtSecret)
    throw new Error(
      "JWT_SECRET must be configured before starting the backend.",
    );
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again after 15 minutes." },
  });
  router.post("/register", async (req, res) => {
    const error = registrationError(req.body);
    if (error) return res.status(400).json({ error });
    const { full_name, username, email, password, phone_number } = req.body;
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        `INSERT INTO farmer (full_name, username, email, password_hash, phone_number) VALUES ($1, $2, $3, $4, $5) RETURNING ${publicColumns}`,
        [
          full_name.trim(),
          username.trim(),
          email.trim(),
          passwordHash,
          phone_number.trim(),
        ],
      );
      return res
        .status(201)
        .json({
          message: "Account created. Please log in.",
          farmer: result.rows[0],
        });
    } catch (err) {
      if (err.code === "23505")
        return res
          .status(409)
          .json({
            error: /username/.test(err.constraint || "")
              ? "Username already registered."
              : "Email already registered.",
          });
      return res
        .status(503)
        .json({ error: "Registration is unavailable. Please try again." });
    }
  });
  router.post("/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (
      typeof username !== "string" ||
      !/^[a-zA-Z0-9._-]{3,50}$/.test(username.trim()) ||
      typeof password !== "string" ||
      !password ||
      password.length > 128
    )
      return res
        .status(400)
        .json({ error: "Enter a valid username and password." });
    try {
      const result = await pool.query(
        `SELECT ${publicColumns}, password_hash FROM farmer WHERE lower(username) = lower($1)`,
        [username.trim()],
      );
      const farmer = result.rows[0];
      const valid = await verifyPassword(password, farmer?.password_hash);
      if (!farmer || !valid)
        return res.status(401).json({ error: "Invalid username or password." });
      delete farmer.password_hash;
      const token = jwt.sign(
        { id: String(farmer.farmer_id), username: farmer.username },
        jwtSecret,
        {
          algorithm: "HS256",
          expiresIn: "7d",
          issuer: "duri.ai",
          audience: "duri.ai.web",
          jwtid: randomBytes(16).toString("hex"),
        },
      );
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expires = new Date(jwt.decode(token).exp * 1000);
      await pool.query(
        "INSERT INTO farmer_session (token_hash, farmer_id, expires_at) VALUES ($1, $2, $3)",
        [tokenHash, farmer.farmer_id, expires],
      );
      return res.json({ message: "Login successful", token, farmer });
    } catch {
      return res
        .status(503)
        .json({ error: "Login is unavailable. Please try again." });
    }
  });
  router.get("/session", authenticate, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ${publicColumns} FROM farmer WHERE farmer_id = $1`,
        [req.farmer.id],
      );
      if (!result.rows.length)
        return res.status(401).json({ error: "Please log in again." });
      return res.json({ farmer: result.rows[0] });
    } catch {
      return res
        .status(503)
        .json({ error: "Unable to load your account. Please try again." });
    }
  });
  router.post("/logout", authenticate, async (req, res) => {
    try {
      await pool.query("DELETE FROM farmer_session WHERE token_hash = $1", [
        req.authTokenHash,
      ]);
      return res.json({ message: "Logged out" });
    } catch {
      return res
        .status(503)
        .json({ error: "Logout could not be confirmed. Please try again." });
    }
  });
  // No OTP is generated, logged or returned until a real recovery delivery path exists.
  router.post("/forgot-password", (_req, res) =>
    res.status(503).json({ error: recoveryMessage }),
  );
  router.post("/reset-password", (_req, res) =>
    res.status(503).json({ error: recoveryMessage }),
  );
  return { router, authenticate };
}
module.exports = { createAuth, migrateAuth, registrationError, verifyPassword };
