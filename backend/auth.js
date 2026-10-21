const { Router } = require("express");
const {
  randomBytes,
  scrypt: scryptCallback,
  timingSafeEqual,
  createHash,
} = require("node:crypto");
const { promisify } = require("node:util");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "duriai_session";
const SESSION_MS = 12 * 60 * 60 * 1000;
const usernamePattern = /^[a-zA-Z0-9._-]{3,50}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api",
};
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
function sessionToken(req) {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token || "") ? token : null;
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${key.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored || "");
  // Never accept the old plaintext password_hash values as valid credentials.
  const key = await scrypt(password, match ? match[1] : "0".repeat(32), 64);
  return Boolean(match) && timingSafeEqual(key, Buffer.from(match[2], "hex"));
}
function registrationError(body) {
  if (
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
  if (!usernamePattern.test(body.username.trim()))
    return "Username must be 3–50 letters, numbers, dots, underscores, or hyphens.";
  if (body.email.trim().length > 200 || !emailPattern.test(body.email.trim()))
    return "Enter a valid email address.";
  if (body.password.length < 8 || body.password.length > 128)
    return "Password must be 8–128 characters.";
  if (
    body.phone_number.trim().length > 20 ||
    !/^[+\d\s()-]+$/.test(body.phone_number.trim()) ||
    body.phone_number.replace(/\D/g, "").length < 7
  )
    return "Enter a valid phone number (7 or more digits, up to 20 characters).";
  return null;
}
async function migrateAuth(pool) {
  const sql = await readFile(
    path.join(__dirname, "migrations/001_auth_sessions.sql"),
    "utf8",
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
function createAuth(pool) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  async function requireSession(req, res, next) {
    res.set("Cache-Control", "no-store");
    const token = sessionToken(req);
    if (!token)
      return res.status(401).json({ error: "Please log in to continue." });
    try {
      const result = await pool.query(
        `SELECT f.farmer_id, f.full_name, f.username, f.email, f.phone_number, f.created_at
        FROM farmer_session s JOIN farmer f ON f.farmer_id = s.farmer_id
        WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [tokenHash(token)],
      );
      if (!result.rows.length) {
        res.clearCookie(SESSION_COOKIE, cookieOptions);
        return res
          .status(401)
          .json({ error: "Your session has expired. Please log in again." });
      }
      req.farmer = result.rows[0];
      next();
    } catch {
      res
        .status(503)
        .json({ error: "Unable to verify your session. Please try again." });
    }
  }
  router.post("/register", async (req, res) => {
    const body = req.body || {};
    const error = registrationError(body);
    if (error) return res.status(400).json({ error });
    const username = body.username.trim().toLowerCase();
    const email = body.email.trim().toLowerCase();
    try {
      const existing = await pool.query(
        "SELECT username, email FROM farmer WHERE lower(username) = $1 OR lower(email) = $2",
        [username, email],
      );
      if (existing.rows.some((row) => row.username.toLowerCase() === username))
        return res.status(409).json({ error: "Username already exists." });
      if (existing.rows.length)
        return res.status(409).json({ error: "Email already exists." });
      const passwordHash = await hashPassword(body.password);
      const result = await pool.query(
        `INSERT INTO farmer (full_name, username, email, password_hash, phone_number)
        VALUES ($1, $2, $3, $4, $5) RETURNING farmer_id, full_name, username, email, phone_number, created_at`,
        [
          body.full_name.trim(),
          username,
          email,
          passwordHash,
          body.phone_number.trim(),
        ],
      );
      res.status(201).json({
        message: "Registration successful. Please log in.",
        farmer: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505")
        return res.status(409).json({
          error: error.constraint?.includes("username")
            ? "Username already exists."
            : "Email already exists.",
        });
      res.status(503).json({
        error:
          "Registration is unavailable. No account was created. Please try again.",
      });
    }
  });
  router.post("/login", async (req, res) => {
    const { username, password } = req.body || {};
    if (
      typeof username !== "string" ||
      !username.trim() ||
      typeof password !== "string" ||
      !password
    )
      return res
        .status(400)
        .json({ error: "Username and password are required." });
    if (!usernamePattern.test(username.trim()) || password.length > 128)
      return res.status(401).json({ error: "Invalid username or password." });
    try {
      const result = await pool.query(
        "SELECT farmer_id, full_name, username, email, phone_number, created_at, password_hash FROM farmer WHERE lower(username) = $1",
        [username.trim().toLowerCase()],
      );
      const farmer = result.rows[0];
      if (!(await verifyPassword(password, farmer?.password_hash)))
        return res.status(401).json({ error: "Invalid username or password." });
      const token = randomBytes(32).toString("hex");
      // Replace only the current browser's session, retaining other devices.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldToken = sessionToken(req);
        if (oldToken)
          await client.query(
            "DELETE FROM farmer_session WHERE token_hash = $1",
            [tokenHash(oldToken)],
          );
        await client.query(
          "DELETE FROM farmer_session WHERE expires_at <= NOW()",
        );
        await client.query(
          "INSERT INTO farmer_session (token_hash, farmer_id, expires_at) VALUES ($1, $2, $3)",
          [
            tokenHash(token),
            farmer.farmer_id,
            new Date(Date.now() + SESSION_MS),
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      const publicFarmer = { ...farmer };
      delete publicFarmer.password_hash;
      res.cookie(SESSION_COOKIE, token, {
        ...cookieOptions,
        maxAge: SESSION_MS,
      });
      res.json({ message: "Login successful.", farmer: publicFarmer });
    } catch {
      res
        .status(503)
        .json({ error: "Login is unavailable. Please try again." });
    }
  });
  router.get("/session", requireSession, (req, res) =>
    res.json({ farmer: req.farmer }),
  );
  router.post("/logout", async (req, res) => {
    try {
      const token = sessionToken(req);
      if (token)
        await pool.query("DELETE FROM farmer_session WHERE token_hash = $1", [
          tokenHash(token),
        ]);
      res.clearCookie(SESSION_COOKIE, cookieOptions);
      res.json({ message: "Logout successful." });
    } catch {
      res.status(503).json({
        error: "Logout failed. Your session is still active. Please try again.",
      });
    }
  });
  return { router, requireSession };
}
module.exports = {
  createAuth,
  migrateAuth,
  hashPassword,
  verifyPassword,
  registrationError,
};
