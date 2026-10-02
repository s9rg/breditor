import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { mergeConfig, type Plugin } from "vite";
import base from "./vite.browser.config";
import { instrumentQueueFaults } from "./tests/browser/diagnostics/queue_fault_instrumentation";
import { instrumentDeliveryFaults } from "./tests/browser/diagnostics/delivery_fault_instrumentation";
import { instrumentLinkFaults } from "./tests/browser/diagnostics/link_fault_instrumentation";
import { instrumentClipboardRoutes } from "./tests/browser/diagnostics/clipboard_route_instrumentation";
import { instrumentProjectionValidation } from "./tests/browser/diagnostics/projection_validation_instrumentation";

const recorder = fileURLToPath(new URL("./tests/browser/diagnostics/queue_fault_recorder.ts", import.meta.url));
const deliveryRecorder = fileURLToPath(new URL("./tests/browser/diagnostics/delivery_fault_recorder.ts", import.meta.url));
const projectionRecorder = fileURLToPath(new URL("./tests/browser/diagnostics/link_fault_recorder.ts", import.meta.url));
const projectionSetting = process.env["BREDITOR_QUEUE_PROJECTION"] ?? "0";
if (projectionSetting !== "0" && projectionSetting !== "1") throw new Error("BREDITOR_QUEUE_PROJECTION must be 0 or 1");
const projectionEnabled = projectionSetting === "1";
const validationSetting = process.env["BREDITOR_QUEUE_PROJECTION_VALIDATION"] ?? "0";
if (validationSetting !== "0" && validationSetting !== "1") throw new Error("BREDITOR_QUEUE_PROJECTION_VALIDATION must be 0 or 1");
const validationEnabled = validationSetting === "1";
if (validationEnabled && !projectionEnabled) throw new Error("Projection validation capture requires BREDITOR_QUEUE_PROJECTION=1");
const clipboardRecorder = fileURLToPath(new URL("./tests/browser/diagnostics/clipboard_route_recorder.ts", import.meta.url));
const clipboardSetting = process.env["BREDITOR_QUEUE_CLIPBOARD"] ?? "0";
if (clipboardSetting !== "0" && clipboardSetting !== "1") throw new Error("BREDITOR_QUEUE_CLIPBOARD must be 0 or 1");
const clipboardEnabled = clipboardSetting === "1";
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
    if ((deliveryEnabled || projectionEnabled || clipboardEnabled) && id.endsWith("/harness/main.ts")) {
      const imports = [`import { readQueueFaults } from ${JSON.stringify(recorder)};`];
      const fields = ["...readQueueFaults()"];
      if (deliveryEnabled) {
        imports.push(`import { readDeliveryFaults } from ${JSON.stringify(deliveryRecorder)};`);
        fields.push("deliveries: readDeliveryFaults()");
      }
      if (projectionEnabled) {
        imports.push(`import { readLinkFaults } from ${JSON.stringify(projectionRecorder)};`);
        fields.push("projection: readLinkFaults()");
      }
      if (clipboardEnabled) {
        imports.push(`import { readClipboardRoutes } from ${JSON.stringify(clipboardRecorder)};`);
        fields.push("clipboard: readClipboardRoutes()");
      }
      return `${imports.join("\n")}\n${code}\nObject.assign(window, { breditorLinkDiagnostics: () => ({ ${fields.join(", ")} }) });`;
    }
    const clipboard = clipboardEnabled ? instrumentClipboardRoutes(code, id, clipboardRecorder) : null;
    if (clipboard !== null) {
      manifest.set("browser_event_router", { instrumented: true, sourceSha256: clipboard.sourceSha256, sites: clipboard.sites });
      return { code: clipboard.code, map: null };
    }
    const validation = validationEnabled ? instrumentProjectionValidation(code, id, projectionRecorder, { requiredProperty: true }) : null;
    if (validation !== null) {
      manifest.set("projection", { instrumented: true, rejectionReturnsOnly: true, requiredPropertyCapture: true,
        sourceSha256: validation.sourceSha256, sites: validation.sites });
      return { code: validation.code, map: null };
    }
    if (projectionEnabled && id.endsWith("/breditor-browser/dist/wasm_projection_adapter.js")) {
      // Observe rejection sites only. In particular, leave the hot isIndex
      // predicate and every successful traversal byte-identical.
      const output = instrumentLinkFaults(code, id, projectionRecorder, { numericPredicates: false, projectionChild: true, projectionImpact: true, impactState: true });
      if (output === null) throw new Error("Projection diagnostic module was not recognized");
      manifest.set("wasm_projection_adapter", { instrumented: true, numericPredicates: false,
        childResultCapture: true, impactRejections: true, impactStateCapture: true, sourceSha256: output.sourceSha256, sites: output.sites });
      return { code: output.code, map: null };
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
      response.writeHead(manifest.size === 6 + Number(deliveryEnabled) + Number(clipboardEnabled) + Number(validationEnabled) ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ modules: Object.fromEntries(manifest) }));
    });
  },
};
export default mergeConfig(base, { plugins: [diagnostic] });
