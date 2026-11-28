const { spawn } = require("node:child_process");
const path = require("node:path");

const PYTHON =
  process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const fs = require("node:fs");
// infer.py may sit next to this file or in an ai/ folder (next to the model).
const SCRIPT_CANDIDATES = [
  path.join(__dirname, "ai", "infer.py"),
  path.join(__dirname, "infer.py"),
];
const SCRIPT =
  process.env.AI_SCRIPT ||
  SCRIPT_CANDIDATES.find((file) => fs.existsSync(file)) ||
  SCRIPT_CANDIDATES[1];
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 60000);

// Runs the TFLite model on image buffers and resolves
// { prediction: "DURIAN" | "NOT_DURIAN", confidence: 0-100, images: n }.
function runInference(buffers, { script = SCRIPT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [script], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const finish = (fn, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(reject, new Error("AI inference timed out."));
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      let result = null;
      try {
        result = JSON.parse(stdout.trim().split("\n").pop());
      } catch {}
      if (code !== 0 || !result || result.error)
        return finish(
          reject,
          new Error(
            result?.error ||
              stderr.trim().split("\n").pop() ||
              `AI process exited with code ${code}.`,
          ),
        );
      if (
        !["DURIAN", "NOT_DURIAN"].includes(result.prediction) ||
        !Number.isFinite(result.confidence)
      )
        return finish(reject, new Error("AI returned an invalid result."));
      finish(resolve, result);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(
      JSON.stringify({ images: buffers.map((buffer) => buffer.toString("base64")) }),
    );
  });
}

module.exports = { runInference };