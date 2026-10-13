import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Strict fixture whitelist. This local test host is not the collaboration relay.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const artifacts = resolve(root, "target/collaboration-feasibility-web");
const resources = new Map([
  ["/", ["text/html; charset=utf-8", Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Breditor Rust collaboration contracts</title><h1>Rust/Wasm collaboration feasibility</h1><p>This tests causal exchange and history, not the finished rich editor.</p><pre id="status" role="status">Loading matching Wasm…</pre><script type="module">import init, { ProbeSession } from '/probe.js'; import { runCase } from '/scenarios.mjs'; await init(); window.probe = { runCase: name => runCase(name, ProbeSession) }; document.querySelector('#status').textContent = 'Ready for contract tests';</script></html>`)]],
  ["/probe.js", ["text/javascript; charset=utf-8", readFileSync(resolve(artifacts, "breditor_collab_feasibility.js"))]],
  ["/breditor_collab_feasibility_bg.wasm", ["application/wasm", readFileSync(resolve(artifacts, "breditor_collab_feasibility_bg.wasm"))]],
  ["/scenarios.mjs", ["text/javascript; charset=utf-8", readFileSync(resolve(root, "experiments/collaboration/browser/scenarios.mjs"))]],
  ["/native-vector.json", ["application/json", readFileSync(resolve(artifacts, "native-vector.json"))]],
]);
const server = createServer((request, response) => {
  const resource = request.method === "GET" ? resources.get(request.url) : undefined;
  if (!resource) { response.writeHead(404); response.end("Not found"); return; }
  response.writeHead(200, { "Content-Type": resource[0], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(resource[1]);
});
server.listen(49772, "127.0.0.1", () => console.log("Breditor collaboration contract host: http://127.0.0.1:49772/"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
