import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mergeConfig, type Plugin } from "vite";
import base from "./vite.browser.config";
import { instrumentQueueFaults } from "./tests/browser/diagnostics/queue_fault_instrumentation";
import { instrumentDeliveryFaults } from "./tests/browser/diagnostics/delivery_fault_instrumentation";

const recorder = fileURLToPath(new URL("./tests/browser/diagnostics/queue_fault_recorder.ts", import.meta.url));
const deliveryRecorder = fileURLToPath(new URL("./tests/browser/diagnostics/delivery_fault_recorder.ts", import.meta.url));
const deliverySetting = process.env["BREDITOR_QUEUE_DELIVERY"] ?? "0";
if (deliverySetting !== "0" && deliverySetting !== "1") throw new Error("BREDITOR_QUEUE_DELIVERY must be 0 or 1");
const deliveryEnabled = deliverySetting === "1";
const mode = process.env["BREDITOR_QUEUE_CAPTURE"] ?? "catch";
if (mode !== "catch" && mode !== "stop") throw new Error("BREDITOR_QUEUE_CAPTURE must be catch or stop");
const untouched = ["wasm_command_adapter", "wasm_selection_adapter", "wasm_projection_adapter", "wasm_profile_descriptor", "wasm_document_json"];
const manifest = new Map<string, unknown>();
const diagnostic: Plugin = {
  name: "breditor-queue-only-diagnostics", enforce: "pre",
  transform(code, id) {
    if (deliveryEnabled && id.endsWith("/harness/main.ts")) {
      return `import { readQueueFaults } from ${JSON.stringify(recorder)};\nimport { readDeliveryFaults } from ${JSON.stringify(deliveryRecorder)};\n${code}\nObject.assign(window, { breditorLinkDiagnostics: () => ({ ...readQueueFaults(), deliveries: readDeliveryFaults() }) });`;
    }
    const delivery = deliveryEnabled ? instrumentDeliveryFaults(code, id, deliveryRecorder) : null;
    if (delivery !== null) {
      manifest.set("browser_editor", { instrumented: true, sourceSha256: delivery.sourceSha256, sites: delivery.sites });
      return { code: delivery.code, map: null };
    }
    const name = untouched.find(name => id.endsWith(`/breditor-browser/dist/${name}.js`));
    if (name) manifest.set(name, { instrumented: false, sourceSha256: createHash("sha256").update(code).digest("hex") });
    const output = instrumentQueueFaults(code, id, recorder, mode);
    if (output === null) return null;
    manifest.set("command_queue", { instrumented: true, mode, sourceSha256: output.sourceSha256, sites: output.sites });
    return { code: output.code, map: null };
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.method !== "GET" || request.url !== "/link-diagnostic-map.json") return next();
      response.writeHead(manifest.size === (deliveryEnabled ? 7 : 6) ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ modules: Object.fromEntries(manifest) }));
    });
  },
};
export default mergeConfig(base, { plugins: [diagnostic] });
