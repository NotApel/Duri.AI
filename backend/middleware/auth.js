const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = header.split(" ")[1];
  try {
    // Added || "secret" so it matches the signing key in app.js
    req.farmer = jwt.verify(token, process.env.JWT_SECRET || "secret");
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};
