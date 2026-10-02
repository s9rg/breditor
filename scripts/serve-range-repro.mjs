/** Read-only loopback host for the exact module used by the standalone JSC run.
 * No Vite client, build transforms, directory browsing, or write endpoints.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const variant = process.env.BREDITOR_RANGE_VARIANT ?? "original";
if (!["original", "staged", "tagged", "int32", "indexed", "storage-capture"].includes(variant)) throw new Error("Unknown range diagnostic variant");
const modulePath = variant === "original" ? "../target/numeric-range-shell-20260928/numeric_range_probe.js"
  : variant === "staged" ? "../target/numeric-range-staged-20260928/numeric_transfer_staged_probe.js"
  : variant === "tagged" ? "../target/numeric-range-tagged-20260928/numeric_transfer_tagged_probe.js"
  : variant === "int32" ? "../target/numeric-range-int32-20260928/numeric_transfer_int32_probe.js"
  : variant === "indexed" ? "../target/numeric-range-indexed-20260928/numeric_transfer_indexed_probe.js"
  : "../target/numeric-range-storage-capture-20260928/numeric_transfer_storage_capture_probe.js";
const probe = readFileSync(new URL(modulePath, import.meta.url));
const sha256 = createHash("sha256").update(probe).digest("hex");
const resources = new Map([
  ["/", ["text/html; charset=utf-8", Buffer.from('<!doctype html><html lang="en"><meta charset="utf-8"><title>Numeric range host</title><body>Static JavaScript-only diagnostic host.</body></html>')]],
  ["/probe.js", ["text/javascript; charset=utf-8", probe]],
  ["/metadata.json", ["application/json", Buffer.from(JSON.stringify({ variant, sha256 }))]],
]);
createServer((request, response) => {
  const resource = request.method === "GET" ? resources.get(request.url) : undefined;
  if (!resource) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "Content-Type": resource[0], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(resource[1]);
}).listen(4240, "127.0.0.1", () => console.log(JSON.stringify({ url: "http://127.0.0.1:4240/", variant, sha256 })));
