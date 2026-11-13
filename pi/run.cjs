const { readFile, stat } = require("node:fs/promises");
const { setTimeout: sleep } = require("node:timers/promises");
const { randomInt } = require("node:crypto");
const { configuration, client, deliverOne } = require("./client.cjs");
const { Outbox } = require("./outbox.cjs");
async function main() {
  const config = configuration(),
    outbox = new Outbox(config.outboxPath, config.identity);
  const sender = client(config);
  const [action, argument] = process.argv.slice(2);
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  try {
    if (action === "enqueue") {
      if (!argument || (await stat(argument)).size > 15 * 1024 * 1024)
        throw new Error("Supply an event JSON file no larger than 15 MB.");
      let event;
      try {
        event = JSON.parse(await readFile(argument, "utf8"));
      } catch {
        throw new Error("The event file must contain valid JSON.");
      }
      console.log(JSON.stringify(outbox.enqueue(event)));
    } else if (action === "status") {
      console.log(JSON.stringify(outbox.status(), null, 2));
    } else if (action === "retry") {
      outbox.retry(argument);
      console.log("Failed event queued again with its original evidence.");
    } else if (action === "worker" || action === "once") {
      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
      let heartbeatAt = 0;
      do {
        // Event delivery gets priority; heartbeats must not serialize long outages per node.
        if (!stop.signal.aborted)
          await deliverOne(outbox, sender, {
            signal: stop.signal,
            jitter: randomInt(0, 501),
          });
        if (Date.now() >= heartbeatAt) {
          await Promise.all(
            config.nodes.map(async (node) => {
              if (stop.signal.aborted) return;
              try {
                const response = await sender.heartbeat(node, stop.signal);
                console.log("Pi heartbeat:", node, response.status);
                await response.body?.cancel();
              } catch {
                console.error("Pi heartbeat unavailable:", node);
              }
            }),
          );
          heartbeatAt = Date.now() + 60000;
        }
        if (action === "once" || stop.signal.aborted) break;
        await sleep(2100, undefined, { signal: stop.signal }).catch(() => {});
      } while (!stop.signal.aborted);
    } else
      throw new Error(
        "Usage: node pi/run.cjs enqueue FILE | worker | once | status | retry EVENT_ID",
      );
  } finally {
    process.removeListener("SIGTERM", shutdown);
    process.removeListener("SIGINT", shutdown);
    outbox.close();
  }
}
main().catch((error) => {
  console.error("Pi sender:", error.message);
  process.exitCode = 1;
});
