import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = dirname(fileURLToPath(import.meta.url));
function pwaAssets() {
  return {
    name: "duriai-public-precache",
    async writeBundle(output, bundle) {
      const assets = [
        "/index.html",
        "/manifest.webmanifest",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/icons/maskable-512.png",
        "/icons/badge-96.png",
        ...Object.keys(bundle)
          .filter((name) => /\.(js|css|woff2?)$/.test(name))
          .map((name) => `/${name}`),
      ].sort();
      const source = await readFile(resolve(root, "public/sw.js"), "utf8");
      const version = createHash("sha256")
        .update(JSON.stringify(assets))
        .update(source)
        .digest("hex")
        .slice(0, 16);
      await writeFile(
        resolve(output.dir || resolve(root, "dist"), "sw.js"),
        source
          .replace("__BUILD__", version)
          .replace(/\/\*__DURI_PRECACHE__\*\/\s*\[\]/, JSON.stringify(assets)),
      );
    },
  };
}
export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    const env = { ...loadEnv(mode, root, "VITE_"), ...process.env };
    try {
      const url = new URL(env.VITE_API_URL);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
        url.hostname,
      );
      const local =
        loopback &&
        !process.env.VERCEL &&
        !process.env.WORKERS_CI &&
        !mode.startsWith("cloudflare");
      if (
        !["http:", "https:"].includes(url.protocol) ||
        (loopback && !local) ||
        (!local && url.protocol !== "https:") ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname.endsWith("/api")
      )
        throw new Error();
    } catch {
      throw new Error(
        "Set VITE_API_URL to the HTTPS API URL ending in /api. HTTP loopback is allowed for local preview only.",
      );
    }
  }
  return { plugins: [react(), tailwindcss(), pwaAssets()] };
});
