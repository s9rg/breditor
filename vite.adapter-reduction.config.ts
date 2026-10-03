import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import base from "./vite.browser.config";
import { instrumentLinkFaults } from "./tests/browser/diagnostics/link_fault_instrumentation";
import { instrumentProjectionValidation } from "./tests/browser/diagnostics/projection_validation_instrumentation";

const recorder = fileURLToPath(new URL("./tests/browser/diagnostics/link_fault_recorder.ts", import.meta.url));
const modules = new Map<string, unknown>();
/** Isolate projection/selection diagnostics without mounting an editor or queue. */
const diagnostic: Plugin = {
  name: "breditor-adapter-reduction", enforce: "pre",
  transform(code, id) {
    const validation = instrumentProjectionValidation(code, id, recorder,
      { requiredProperty: true, requiredPropertySource: true });
    if (validation) {
      modules.set("projection", { sourceSha256: validation.sourceSha256, sites: validation.sites });
      return { code: validation.code, map: null };
    }
    const selection = id.endsWith("/breditor-browser/dist/wasm_selection_adapter.js");
    const projection = id.endsWith("/breditor-browser/dist/wasm_projection_adapter.js");
    if (!selection && !projection) return null;
    const output = instrumentLinkFaults(code, id, recorder, { numericPredicates: true,
      numericOperands: false, projectionChild: projection, projectionImpact: projection, impactState: projection, projectionTextRun: projection });
    if (!output) throw new Error("Adapter reduction source not recognized");
    modules.set(output.module, { sourceSha256: output.sourceSha256, sites: output.sites,
      numericPredicates: true, numericOperands: false, projectionTextRun: projection });
    return { code: output.code, map: null };
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.method !== "GET" || request.url !== "/adapter-reduction-map.json") return next();
      response.writeHead(modules.size === 3 ? 200 : 503,
        { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ modules: Object.fromEntries(modules) }));
    });
  },
};
export default defineConfig({ ...base, plugins: [diagnostic] });
