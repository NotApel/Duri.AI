const { createHash } = require("node:crypto");
const jwt = require("jsonwebtoken");

module.exports = function createAuthMiddleware(
  pool,
  { jwtSecret = process.env.JWT_SECRET } = {},
) {
  if (!jwtSecret)
    throw new Error(
      "JWT_SECRET must be configured before starting the backend.",
    );
  return async function authenticate(req, res, next) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer "))
      return res.status(401).json({ error: "Authentication required" });
    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret, {
        algorithms: ["HS256"],
        issuer: "duri.ai",
        audience: "duri.ai.web",
      });
      if (!payload || !/^\d+$/.test(String(payload.id)))
        throw new Error("Invalid identity");
    } catch {
      return res
        .status(401)
        .json({ error: "Your login has expired. Please log in again." });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    try {
      const session = await pool.query(
        "SELECT farmer_id FROM farmer_session WHERE token_hash = $1 AND farmer_id = $2 AND expires_at > NOW()",
        [tokenHash, payload.id],
      );
      if (!session.rows.length)
        return res
          .status(401)
          .json({ error: "Your login has expired. Please log in again." });
      req.farmer = { id: String(payload.id), username: payload.username };
      req.authTokenHash = tokenHash;
      return next();
    } catch {
      return res
        .status(503)
        .json({ error: "Unable to check your login. Please try again." });
    }
  };
};
