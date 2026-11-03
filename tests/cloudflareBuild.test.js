import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { execPath, env } from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cases = [
  ["HTTPS localhost", "cloudflare", "https://localhost/api", ""],
  ["unsupported URL scheme", "cloudflare", "ftp://localhost/api", ""],
  ["Cloudflare production", "cloudflare", "http://localhost:3000/api", ""],
  ["Cloudflare staging", "cloudflare-staging", "http://127.0.0.1:3000/api", ""],
  [
    "Workers Builds using the default build",
    "production",
    "http://localhost:3000/api",
    "1",
  ],
  ["missing API URL", "cloudflare", "", ""],
  ["remote HTTP API", "cloudflare", "http://backend.example.invalid/api", ""],
  ["missing API path", "cloudflare", "https://backend.example.invalid", ""],
  [
    "credentials in an API URL",
    "cloudflare",
    "https://user:password@backend.example.invalid/api",
    "",
  ],
];
for (const [label, mode, api, workersCI] of cases) {
  test(`${label} rejects unsafe deployment configuration before building`, () => {
    const result = spawnSync(
      execPath,
      [
        "node_modules/vite/bin/vite.js",
        "build",
        "--mode",
        mode,
        "--outDir",
        join(tmpdir(), "duri-invalid-cloudflare-build"),
      ],
      {
        cwd: root,
        env: { ...env, VITE_API_URL: api, WORKERS_CI: workersCI, VERCEL: "" },
        encoding: "utf8",
        timeout: 15000,
      },
    );
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Set VITE_API_URL to the HTTPS API URL ending in \/api/,
    );
  });
}
