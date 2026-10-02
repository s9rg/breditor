import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// Serve only an explicitly selected diagnostic entry and the native wrapper.
// No repository browsing, Wasm assets, dynamic chunks or write endpoints.
const variant = process.argv[2] ?? "js-dataview-bare";
if (!["js-dataview", "js-dataview-bare", "js-only", "js-cold-branch", "js-cold-minimal"].includes(variant)) throw new Error("Unsupported native number variant");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = resolve(root, "target/property-transport", variant);
const index = readFileSync(resolve(build, "index.html"), "utf8");
const entry = index.match(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1];
if (!entry) throw new Error("Diagnostic entry script not found");
const bytes = readFileSync(resolve(build, `.${entry}`));
if (bytes.includes("WebAssembly")) throw new Error("Selected entry still contains WebAssembly code");
const metadata = { variant, bundleSha256: createHash("sha256").update(bytes).digest("hex"), plannedBatches: 10, iterationsPerBatch: 10000, tuplesPerBatch: 20000 };
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Breditor native JavaScript number reproduction</title>
<h1>JavaScript-only numeric comparison</h1><p>Exact preserved bundle. Ten reload batches. Stops on failure. No clipboard access.</p>
<button id="start">Start 10 batches</button><button id="stop">Stop after current batch</button><pre id="report" role="status"></pre>
<script id="metadata" type="application/json">${JSON.stringify(metadata)}</script>
<script type="module" src="${entry}"></script><script type="module" src="/native-number-runner.js"></script></html>`;
const resources = new Map([
  ["/", ["text/html; charset=utf-8", Buffer.from(page)]],
  [entry, ["text/javascript; charset=utf-8", bytes]],
  ["/native-number-runner.js", ["text/javascript; charset=utf-8", readFileSync(resolve(root, "tests/browser/diagnostics/native_number_runner.js"))]],
]);
const server = createServer((request, response) => {
  const resource = request.method === "GET" ? resources.get(request.url) : undefined;
  if (!resource) { response.writeHead(404); response.end("Not found"); return; }
  response.writeHead(200, { "Content-Type": resource[0], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(resource[1]);
});
server.listen(4202, "127.0.0.1", () => console.log(JSON.stringify({ url: "http://127.0.0.1:4202/", ...metadata })));
