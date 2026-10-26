const nodemailer = require("nodemailer");
class ResetDeliveryError extends Error {}
function createResetMailer(env = process.env) {
  let origin;
  try {
    const url = new URL(env.FRONTEND_URL);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    origin = url.origin;
  } catch {
    return null;
  }
  const port = Number(env.SMTP_PORT || 587);
  if (
    !env.SMTP_HOST ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.SMTP_FROM || "") ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    ![undefined, "", "true", "false"].includes(env.SMTP_SECURE) ||
    Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)
  )
    return null;
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  const localSmtp = ["localhost", "127.0.0.1", "::1"].includes(env.SMTP_HOST);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && !localSmtp,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  return async function sendResetEmail(to, token) {
    // A fragment keeps the credential out of frontend HTTP requests/access logs.
    const url = new URL("/reset-password", origin);
    url.hash = new URLSearchParams({ token }).toString();
    try {
      const result = await transport.sendMail({
        from: env.SMTP_FROM,
        to,
        subject: "Reset your Duri.AI password",
        text: `A password reset was requested for your Duri.AI account.\n\nOpen this link to choose a new password:\n${url.href}\n\nThe link expires in 15 minutes and can be used once. If you did not request it, ignore this email. Your password has not changed.`,
      });
      if (
        !result.accepted?.some(
          (address) => String(address).toLowerCase() === to.toLowerCase(),
        )
      )
        throw new Error("Recipient not accepted");
    } catch (error) {
      throw new ResetDeliveryError("Password reset email delivery failed.", {
        cause: error,
      });
    }
  };
}
module.exports = { createResetMailer, ResetDeliveryError };
