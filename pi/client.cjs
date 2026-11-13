const { resolve } = require("node:path");
function configuration(env = process.env) {
  let url;
  try {
    url = new URL(env.PI_API_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" &&
        !(
          local &&
          env.PI_ALLOW_LOCAL_HTTP === "true" &&
          url.protocol === "http:"
        )) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new Error(
      "PI_API_URL must be an HTTPS backend origin, without /api or credentials.",
    );
  }
  const match = /^duri_pi_([a-f0-9-]{36})\.[a-f0-9]{64}$/.exec(
    env.PI_GATEWAY_CREDENTIAL || "",
  );
  if (!match || !require("../backend/eventValidation").uuidPattern.test(match[1]))
    throw new Error(
      "Configure PI_GATEWAY_CREDENTIAL with a provisioned gateway credential.",
    );
  if (![undefined, "true", "false"].includes(env.PI_SIMULATION))
    throw new Error("PI_SIMULATION must be true or false.");
  if (
    !env.PI_OUTBOX_PATH ||
    !require("node:path").isAbsolute(env.PI_OUTBOX_PATH)
  )
    throw new Error(
      "PI_OUTBOX_PATH must be an absolute path to a persistent SQLite file.",
    );
  const nodes = (env.PI_NODE_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (nodes.length > 30 || new Set(nodes).size !== nodes.length)
    throw new Error(
      "PI_NODE_IDS must contain at most 30 unique assigned node IDs.",
    );
  const { requireId } = require("../backend/apiHelpers");
  nodes.forEach(requireId);
  return {
    api: url.origin,
    credential: env.PI_GATEWAY_CREDENTIAL,
    simulation: env.PI_SIMULATION === "true",
    outboxPath: resolve(env.PI_OUTBOX_PATH),
    nodes,
    identity: JSON.stringify([
      url.origin,
      match[1],
      env.PI_SIMULATION === "true",
    ]),
  };
}
function client(config, fetcher = fetch) {
  async function request(path, payload, signal, timeout = 120000) {
    return fetcher(`${config.api}${path}`, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${config.credential}`,
        "Content-Type": "application/json",
        ...(config.simulation ? { "x-duriai-simulation": "true" } : {}),
      },
      body: JSON.stringify(payload),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout),
    });
  }
  return {
    simulation: config.simulation,
    send: (payload, signal) => request("/api/device/events", payload, signal),
    heartbeat: (node, signal) =>
      request(`/api/device/nodes/${node}/heartbeat`, {}, signal, 15000),
  };
}
async function deliverOne(
  outbox,
  sender,
  { now = Date.now(), signal, jitter = 0 } = {},
) {
  const job = outbox.claim(now, 150000);
  if (!job) return false;
  let code = "NETWORK_ERROR",
    wait = 0;
  try {
    const response = await sender.send(JSON.parse(job.payload), signal);
    code = `HTTP_${response.status}`;
    if ([200, 201].includes(response.status)) {
      code = "INVALID_ACK";
      const ack = await response.json();
      if (
        ack.source_event_id !== job.event_id ||
        !/^[1-9]\d*$/.test(String(ack.detection_id)) ||
        ack.simulation !== sender.simulation
      )
        throw new Error("Invalid event acknowledgement");
      outbox.finish(job, "SENT", null, 0, now);
      return true;
    }
    if (response.status < 500 && ![408, 425, 429].includes(response.status)) {
      await response.body?.cancel();
      outbox.finish(job, "FAILED", code, 0, now);
      return true;
    }
    const retry = response.headers.get("retry-after");
    wait = /^\d+$/.test(retry || "")
      ? Number(retry) * 1000
      : Math.max(0, Date.parse(retry) - now) || 0;
    await response.body?.cancel();
  } catch {
    /* Keep evidence on unknown network outcomes and malformed acknowledgements. */
  }
  const backoff = Math.min(300000, 1000 * 2 ** Math.min(job.attempts - 1, 9));
  outbox.finish(
    job,
    "PENDING",
    code,
    now + Math.max(backoff + jitter, wait),
    now,
  );
  return true;
}
module.exports = { configuration, client, deliverOne };
