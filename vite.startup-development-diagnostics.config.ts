import { fileURLToPath } from "node:url";
import { mergeConfig, type Plugin } from "vite";
import base from "./vite.browser.config";
import { instrumentStartupModule } from "./tests/browser/diagnostics/startup_instrumentation";

const recorder = fileURLToPath(new URL("./tests/browser/diagnostics/startup_recorder.ts", import.meta.url));
const manifest = new Map<string, unknown>();
const diagnostic: Plugin = {
  name: "breditor-startup-development-diagnostics", enforce: "pre",
  transform(code, id) {
    if (id.endsWith("/harness/selection_restore_probe.ts")) {
      return `import { readStartupRejections } from ${JSON.stringify(recorder)};\n${code}\nObject.assign(window, { breditorStartupDiagnostics: readStartupRejections });`;
    }
    const output = instrumentStartupModule(code, id, recorder);
    if (output === null) return null;
    manifest.set(id.split("/").at(-1)!, { sourceSha256: output.sourceSha256, sites: output.sites });
    return { code: output.code, map: null };
  },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.method !== "GET" || request.url !== "/startup-diagnostic-map.json") return next();
      response.writeHead(manifest.size === 5 ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ version: 1, modules: Object.fromEntries(manifest) }));
    });
  },
};

/** Keep the failing ordinary module graph; add rejection-only observers, no bundling. */
export default mergeConfig(base, { plugins: [diagnostic] });
