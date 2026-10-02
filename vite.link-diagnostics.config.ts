import { fileURLToPath } from "node:url";
import { mergeConfig, type Plugin } from "vite";
import browser from "./vite.browser.config";
import { instrumentLinkFaults } from "./tests/browser/diagnostics/link_fault_instrumentation";
import { instrumentContentFaults } from "./tests/browser/diagnostics/content_fault_instrumentation";

const recorder = fileURLToPath(new URL("./tests/browser/diagnostics/link_fault_recorder.ts", import.meta.url));
const manifest = new Map<string, unknown>();
const plugin: Plugin = {
  name: "breditor-link-fault-diagnostics", enforce: "pre",
  transform(code, id) {
    if (id.endsWith("/tests/browser/harness/main.ts")) {
      return `import { readLinkFaults, recordLoopResult } from ${JSON.stringify(recorder)};\n${code}\nObject.assign(window, { breditorLinkDiagnostics: readLinkFaults, breditorTraceLoopResult: recordLoopResult });`;
    }
    const output = instrumentLinkFaults(code, id, recorder) ?? instrumentContentFaults(code, id, recorder);
    if (output === null) return null;
    manifest.set(output.module, { sourceSha256: output.sourceSha256, sites: output.sites });
    return { code: output.code, map: null };
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.method !== "GET" || request.url !== "/link-diagnostic-map.json") return next();
      response.writeHead(manifest.size === 9 ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ modules: Object.fromEntries(manifest) }));
    });
  },
};
export default mergeConfig(browser, { plugins: [plugin] });
