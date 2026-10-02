/** Visible native-browser qualification of an unchanged full-consumer bundle.
 * Usage: node scripts/serve-boundary-repro.mjs original|normalized|runtime [port]
 * Loopback only; exact entry/Wasm/runner whitelist; no write endpoints.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const variant = process.argv[2];
if (![3, 4].includes(process.argv.length) || !["original", "normalized", "runtime"].includes(variant)) throw new Error("Expected original, normalized or runtime and optional port");
const portText = process.argv[3] ?? "4203";
const port = Number(portText);
if (!/^[0-9]+$/.test(portText) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Expected port 1024–65535");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = resolve(root, "target", variant === "original" ? "selection-stress-production" : variant === "normalized" ? "numeric-normalization" : "selection-runtime-production");
const html = readFileSync(resolve(build, "index.html"), "utf8");
const entry = html.match(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1];
if (!entry) throw new Error("Missing selection entry");
const js = readFileSync(resolve(build, `.${entry}`));
const wasmName = js.toString().match(/breditor_wasm_bg-[A-Za-z0-9_-]+\.wasm/)?.[0];
if (!wasmName) throw new Error("Missing selection Wasm asset");
const wasm = readFileSync(resolve(build, "assets", wasmName));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const runner = readFileSync(resolve(root, "tests/browser/diagnostics/native_boundary_runner.js"));
const metadata = { variant, bundleSha256: sha(js), wasmSha256: sha(wasm), runnerSha256: sha(runner), plannedBatches: 5, restoresPerBatch: 10000, readsPerBatch: 30000 };
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Breditor native boundary qualification</title>
<h1>Full editor boundary: ${variant}</h1><p>Five fresh-page batches. Real Rust/Wasm startup and selection. Stops on failure. No clipboard access.</p>
<button id="start">Start 5 batches</button><button id="stop">Stop after current batch</button><pre id="report" role="status"></pre>
<script id="metadata" type="application/json">${JSON.stringify(metadata)}</script>
<script type="module" src="${entry}"></script><script type="module" src="/native-boundary-runner.js"></script></html>`;
const resources = new Map([
  ["/", ["text/html; charset=utf-8", Buffer.from(page)]],
  [entry, ["text/javascript; charset=utf-8", js]],
  [`/assets/${wasmName}`, ["application/wasm", wasm]],
  ["/native-boundary-runner.js", ["text/javascript; charset=utf-8", runner]],
]);
createServer((request, response) => {
  const resource = request.method === "GET" ? resources.get(request.url) : undefined;
  if (!resource) { response.writeHead(404); response.end("Not found"); return; }
  response.writeHead(200, { "Content-Type": resource[0], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(resource[1]);
}).listen(port, "127.0.0.1", () => console.log(JSON.stringify({ url: `http://127.0.0.1:${port}/`, ...metadata })));
