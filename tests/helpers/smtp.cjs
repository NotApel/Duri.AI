// A local SMTP sink for tests only. No message leaves this process.
const net = require("node:net");
const { once } = require("node:events");
async function startSmtp() {
  const messages = [],
    sockets = new Set();
  let rejecting = false;
  let acceptanceGate = null;
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "",
      data = false,
      lines = [],
      recipient = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let boundary;
      while ((boundary = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (data) {
          if (line === ".") {
            messages.push({ to: recipient, raw: lines.join("\r\n") });
            data = false;
            lines = [];
            if (acceptanceGate) {
              const gate = acceptanceGate;
              acceptanceGate = null;
              gate.then(() => socket.write("250 message accepted\r\n"));
            } else socket.write("250 message accepted\r\n");
          } else lines.push(line.startsWith("..") ? line.slice(1) : line);
        } else if (/^EHLO|^HELO/i.test(line))
          socket.write("250-localhost\r\n250 SIZE 1048576\r\n");
        else if (/^MAIL FROM:/i.test(line))
          socket.write("250 sender accepted\r\n");
        else if (/^RCPT TO:/i.test(line)) {
          recipient = line.match(/<([^>]+)>/)?.[1] || "";
          socket.write(
            rejecting
              ? "550 test-only recipient rejection\r\n"
              : "250 recipient accepted\r\n",
          );
        } else if (/^DATA$/i.test(line)) {
          data = true;
          socket.write("354 end with dot\r\n");
        } else if (/^QUIT$/i.test(line)) socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    port: server.address().port,
    messages,
    reject(value) {
      rejecting = value;
    },
    holdNextAcceptance() {
      let release;
      acceptanceGate = new Promise((resolve) => {
        release = resolve;
      });
      return release;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
function resetLink(message) {
  const decoded = message.raw
    .replace(/=\r?\n/g, "")
    .replace(/=([A-F0-9]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  const match = decoded.match(
    /https?:\/\/[^\s<>]+\/reset-password#token=[a-f0-9]{64}/,
  );
  if (!match) throw new Error("Test mailbox did not contain a reset link.");
  return new URL(match[0]);
}
module.exports = { startSmtp, resetLink };
