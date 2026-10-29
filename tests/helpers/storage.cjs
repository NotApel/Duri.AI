// Local Supabase Storage protocol emulator. No cloud credentials or external network.
const { createServer } = require("node:http");
const { once } = require("node:events");
function storageEmulator() {
  const objects = new Map(),
    uploads = [];
  let origin,
    uploadFailures = 0,
    afterWriteFailures = 0,
    signFailures = 0,
    isPublic = false;
  const key = "test-only-storage-service-key";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const parts = decodeURIComponent(url.pathname).split("/");
    const reply = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify(data));
    };
    if (
      req.method === "GET" &&
      url.pathname.startsWith("/storage/v1/object/sign/")
    ) {
      const object = objects.get(parts.slice(6).join("/"));
      if (url.searchParams.get("token") !== "test-signed-access" || !object)
        return reply(404, { error: "Missing image" });
      res.writeHead(200, {
        "Content-Type": object.type,
        "Cache-Control": "private,max-age=0",
      });
      res.end(object.bytes);
      return;
    }
    if (
      req.headers.authorization !== `Bearer ${key}` ||
      req.headers.apikey !== key
    )
      return reply(401, { error: "Unauthorized" });
    if (req.method === "GET" && url.pathname.startsWith("/storage/v1/bucket/"))
      return reply(200, { id: parts.at(-1), public: isPublic });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if (
      req.method === "POST" &&
      url.pathname === "/storage/v1/object/sign/harvest-images"
    ) {
      if (signFailures-- > 0)
        return reply(503, { error: "Test signing failure" });
      const { paths } = JSON.parse(bytes.toString("utf8"));
      return reply(
        200,
        paths.map((path) => ({
          path,
          signedURL: `/object/sign/harvest-images/${path}?token=test-signed-access`,
        })),
      );
    }
    if (
      req.method === "POST" &&
      url.pathname.startsWith("/storage/v1/object/harvest-images/")
    ) {
      const path = parts.slice(5).join("/");
      uploads.push(path);
      if (uploadFailures-- > 0)
        return reply(503, { error: "Test upload failure" });
      if (objects.has(path)) return reply(409, { error: "Duplicate" });
      objects.set(path, { bytes, type: req.headers["content-type"] });
      if (afterWriteFailures-- > 0)
        return reply(503, { error: "Response lost after storing image" });
      return reply(200, { Key: `harvest-images/${path}` });
    }
    reply(404, { error: "Unknown storage operation" });
  });
  return {
    objects,
    uploads,
    key,
    async start() {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      origin = `http://127.0.0.1:${server.address().port}`;
      return origin;
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
    failUploads(count = 1) {
      uploadFailures = count;
    },
    failAfterWrite(count = 1) {
      afterWriteFailures = count;
    },
    failSigning(count = 1) {
      signFailures = count;
    },
    setPublic(value) {
      isPublic = value;
    },
  };
}
module.exports = { storageEmulator };
