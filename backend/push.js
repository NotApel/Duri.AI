const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const webPush = require("web-push");
const { randomUUID, ECDH } = require("node:crypto");
const { digest } = require("./eventValidation");
const { fail, route, transaction } = require("./apiHelpers");
function pushConfig(env = process.env) {
  const enabled = env.PUSH_ENABLED === "true";
  const config = {
    enabled,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT,
  };
  if (enabled) {
    try {
      if (!/^(mailto:|https:\/\/)/.test(config.subject || ""))
        throw new Error();
      webPush.setVapidDetails(
        config.subject,
        config.publicKey,
        config.privateKey,
      );
    } catch {
      throw new Error(
        "PUSH_ENABLED requires valid VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.",
      );
    }
  }
  return config;
}
function validateSubscription(body, config) {
  const subscription = body?.subscription;
  if (
    !subscription ||
    body.vapid_public_key !== config.publicKey ||
    typeof subscription.endpoint !== "string" ||
    subscription.endpoint.length > 4096
  )
    fail(400, "Invalid push subscription or application key.");
  let endpoint;
  try {
    endpoint = new URL(subscription.endpoint);
    const host = endpoint.hostname;
    const allowed =
      [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(host) || host.endsWith(".notify.windows.com");
    if (
      !allowed ||
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash ||
      endpoint.port
    )
      throw new Error();
    const p256dh = subscription.keys?.p256dh,
      auth = subscription.keys?.auth;
    if (
      typeof p256dh !== "string" ||
      typeof auth !== "string" ||
      !/^[\w-]{87}=?$/.test(p256dh) ||
      !/^[\w-]{22}={0,2}$/.test(auth)
    )
      throw new Error();
    const publicKey = Buffer.from(p256dh, "base64url");
    if (
      publicKey.length !== 65 ||
      publicKey[0] !== 4 ||
      Buffer.from(auth, "base64url").length !== 16
    )
      throw new Error();
    ECDH.convertKey(
      publicKey,
      "prime256v1",
      undefined,
      undefined,
      "uncompressed",
    );
    return {
      endpoint: endpoint.href,
      p256dh,
      auth,
      hash: digest(endpoint.href),
    };
  } catch {
    fail(400, "Invalid or unsupported browser push subscription.");
  }
}
async function enqueueNotification(client, notificationId, farmerId) {
  const result = await client.query(
    `INSERT INTO push_delivery(delivery_id,notification_id,subscription_id)
    SELECT gen_random_uuid(),$1,s.subscription_id FROM push_subscription s
    JOIN farmer_session fs ON fs.token_hash=s.session_token_hash AND fs.farmer_id=s.farmer_id
    WHERE s.farmer_id=$2 AND fs.expires_at>NOW()
    ON CONFLICT(notification_id,subscription_id) DO NOTHING`,
    [notificationId, farmerId],
  );
  return result.rowCount;
}
function createPushRoutes(pool, authenticate, config) {
  const router = Router();
  router.get("/push/public-key", (_req, res) =>
    res.set("Cache-Control", "no-store").json({
      enabled: config.enabled,
      public_key: config.enabled ? config.publicKey : null,
    }),
  );
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many push subscription changes. Please try again shortly.",
    },
  });
  const ready = (_req, _res, next) =>
    config.enabled
      ? next()
      : next(
          Object.assign(new Error("Push notifications are not configured."), {
            status: 503,
          }),
        );
  router.get(
    "/push/subscriptions",
    authenticate,
    route(async (req, res) => {
      const result = await pool.query(
        "SELECT subscription_id,endpoint_hash,vapid_public_key FROM push_subscription WHERE farmer_id=$1 AND session_token_hash=$2",
        [req.farmer.id, req.authTokenHash],
      );
      res.set("Cache-Control", "no-store").json({ subscriptions: result.rows });
    }),
  );
  router.post(
    "/push/subscriptions",
    authenticate,
    limiter,
    ready,
    route(async (req, res) => {
      const value = validateSubscription(req.body, config);
      const saved = await transaction(pool, async (client) => {
        // An endpoint is a capability: never transfer a live subscription to a different farmer.
        // Serialise claims for a previously unseen endpoint as well as existing rows.
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [value.hash],
        );
        await client.query(
          "DELETE FROM push_subscription s WHERE s.endpoint_hash=$1 AND NOT EXISTS(SELECT 1 FROM farmer_session fs WHERE fs.token_hash=s.session_token_hash AND fs.expires_at>NOW())",
          [value.hash],
        );
        const existing = (
          await client.query(
            "SELECT farmer_id FROM push_subscription WHERE endpoint_hash=$1 FOR UPDATE",
            [value.hash],
          )
        ).rows[0];
        if (existing && existing.farmer_id !== req.farmer.id)
          fail(
            409,
            "This browser subscription belongs to another active account. Reset this browser subscription before enabling alerts.",
          );
        const live = (
          await client.query(
            "SELECT 1 FROM farmer_session WHERE token_hash=$1 AND farmer_id=$2 AND expires_at>NOW() FOR KEY SHARE",
            [req.authTokenHash, req.farmer.id],
          )
        ).rows.length;
        if (!live) fail(401, "Please log in again.");
        return (
          await client.query(
            `INSERT INTO push_subscription(subscription_id,farmer_id,session_token_hash,endpoint_hash,endpoint,p256dh,auth,vapid_public_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(endpoint_hash) DO UPDATE SET
        session_token_hash=EXCLUDED.session_token_hash,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,vapid_public_key=EXCLUDED.vapid_public_key,updated_at=NOW()
        RETURNING subscription_id,endpoint_hash`,
            [
              randomUUID(),
              req.farmer.id,
              req.authTokenHash,
              value.hash,
              value.endpoint,
              value.p256dh,
              value.auth,
              config.publicKey,
            ],
          )
        ).rows[0];
      });
      res.status(201).json(saved);
    }),
  );
  router.delete(
    "/push/subscriptions",
    authenticate,
    limiter,
    route(async (req, res) => {
      const hash = req.body?.endpoint_hash;
      if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
        fail(400, "A valid subscription identifier is required.");
      await pool.query(
        "DELETE FROM push_subscription WHERE endpoint_hash=$1 AND farmer_id=$2 AND session_token_hash=$3",
        [hash, req.farmer.id, req.authTokenHash],
      );
      res.json({
        message: "Push alerts disabled for this session and browser.",
      });
    }),
  );
  // Errors from the readiness middleware use the same safe response shape.
  router.use((error, _req, res, next) =>
    error.status
      ? res.status(error.status).json({ error: error.message })
      : next(error),
  );
  return router;
}
function createPushWorker(
  pool,
  config,
  { send = webPush.sendNotification.bind(webPush), intervalMs = 5000 } = {},
) {
  let timer,
    running = false,
    stopping = false,
    inFlight = Promise.resolve();
  const delays = [60000, 300000, 900000, 3600000];
  async function tick() {
    if (!config.enabled || running || stopping) return;
    running = true;
    try {
      await pool.query(
        "UPDATE push_delivery SET status='FAILED',last_error='EXPIRED',lease_id=NULL,locked_until=NULL WHERE status IN ('PENDING','PROCESSING') AND expires_at<=NOW()",
      );
      await pool.query(
        "UPDATE push_delivery SET status='FAILED',last_error='RETRY_LIMIT',lease_id=NULL,locked_until=NULL WHERE attempts>=5 AND (status='PENDING' OR (status='PROCESSING' AND locked_until<NOW()))",
      );
      const jobs = await transaction(pool, async (client) => {
        const result =
          await client.query(`WITH claim AS (SELECT delivery_id FROM push_delivery WHERE expires_at>NOW() AND
          ((status='PENDING' AND available_at<=NOW()) OR (status='PROCESSING' AND locked_until<NOW()))
          ORDER BY available_at,delivery_id FOR UPDATE SKIP LOCKED LIMIT 5)
          UPDATE push_delivery d SET status='PROCESSING',attempts=attempts+1,locked_until=NOW()+INTERVAL '60 seconds',lease_id=gen_random_uuid()
          FROM claim WHERE d.delivery_id=claim.delivery_id RETURNING d.*`);
        return result.rows;
      });
      const outcomes = await Promise.allSettled(jobs.map(deliver));
      for (const outcome of outcomes)
        if (outcome.status === "rejected")
          console.error(
            "Push delivery deferred:",
            outcome.reason?.code || "WORKER_ERROR",
          );
    } catch (error) {
      console.error("Push worker unavailable:", error.code || "DATABASE_ERROR");
    } finally {
      running = false;
    }
  }
  async function deliver(job) {
    const current = (
      await pool.query(
        `SELECT s.*,n.detection_id FROM push_delivery d
      JOIN push_subscription s ON s.subscription_id=d.subscription_id JOIN notification n ON n.notification_id=d.notification_id
      JOIN detection event_record ON event_record.detection_id=n.detection_id AND event_record.detection_status='VERIFIED'
      JOIN farmer_session fs ON fs.token_hash=s.session_token_hash AND fs.farmer_id=s.farmer_id
      WHERE d.delivery_id=$1 AND d.lease_id=$2 AND s.farmer_id=n.farmer_id AND fs.expires_at>NOW()`,
        [job.delivery_id, job.lease_id],
      )
    ).rows[0];
    if (new Date(job.expires_at).getTime() <= Date.now()) {
      await finish(job, "FAILED", "EXPIRED");
      return;
    }
    if (!current || current.vapid_public_key !== config.publicKey) {
      await finish(job, "CANCELLED", "SESSION_EVENT_OR_KEY_CHANGED");
      return;
    }
    const notification = (
      await pool.query(
        "SELECT title,created_at FROM notification WHERE notification_id=$1",
        [job.notification_id],
      )
    ).rows[0];
    try {
      await send(
        {
          endpoint: current.endpoint,
          keys: { p256dh: current.p256dh, auth: current.auth },
        },
        JSON.stringify({
          title: notification.title,
          body: "Open Duri.AI to review the harvest event.",
          farmer_id: String(current.farmer_id),
          tag: `harvest-${current.detection_id}`,
          url: `/map/events/${current.detection_id}`,
        }),
        {
          TTL: Math.max(
            1,
            Math.min(
              86400,
              Math.floor(
                (new Date(job.expires_at).getTime() - Date.now()) / 1000,
              ),
            ),
          ),
          timeout: 10000,
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
        },
      );
      await pool.query(
        "UPDATE push_delivery SET status='SENT',sent_at=NOW(),lease_id=NULL,locked_until=NULL,last_error=NULL WHERE delivery_id=$1 AND lease_id=$2",
        [job.delivery_id, job.lease_id],
      );
      console.info("Push accepted:", job.delivery_id);
    } catch (error) {
      const status = Number(error.statusCode);
      if ([404, 410].includes(status)) {
        await pool.query(
          "DELETE FROM push_subscription WHERE subscription_id=$1 AND endpoint_hash=$2",
          [current.subscription_id, current.endpoint_hash],
        );
        console.info(
          "Expired push subscription removed:",
          current.subscription_id,
        );
        return;
      }
      const retryable = !status || status === 429 || status >= 500;
      const code = status ? `PROVIDER_${status}` : "NETWORK_ERROR";
      if (!retryable || job.attempts >= 5) {
        await finish(job, "FAILED", code);
        return;
      }
      const header = error.headers?.["retry-after"];
      const retryAfter = header
        ? /^\d+$/.test(String(header))
          ? Number(header) * 1000
          : Date.parse(header) - Date.now()
        : 0;
      const delay = Math.max(
        delays[Math.min(job.attempts - 1, delays.length - 1)],
        Number.isFinite(retryAfter) ? Math.max(0, retryAfter) : 0,
      );
      await pool.query(
        "UPDATE push_delivery SET status='PENDING',available_at=NOW()+($3::double precision*INTERVAL '1 millisecond'),locked_until=NULL,lease_id=NULL,last_error=$4 WHERE delivery_id=$1 AND lease_id=$2",
        [job.delivery_id, job.lease_id, Math.min(delay, 86400000), code],
      );
      console.info("Push retry queued:", job.delivery_id, code);
    }
  }
  async function finish(job, status, code) {
    await pool.query(
      "UPDATE push_delivery SET status=$3,last_error=$4,locked_until=NULL,lease_id=NULL WHERE delivery_id=$1 AND lease_id=$2",
      [job.delivery_id, job.lease_id, status, code],
    );
  }
  return {
    tick,
    start() {
      if (!config.enabled || timer) return;
      timer = setInterval(() => {
        inFlight = tick();
      }, intervalMs);
      timer.unref();
      inFlight = tick();
    },
    async stop() {
      stopping = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
module.exports = {
  pushConfig,
  validateSubscription,
  enqueueNotification,
  createPushRoutes,
  createPushWorker,
};
