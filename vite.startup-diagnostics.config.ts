import { fileURLToPath } from "node:url";
import { mergeConfig, type Plugin } from "vite";
import base from "./vite.selection-stress.config";
import { instrumentStartupModule } from "./tests/browser/diagnostics/startup_instrumentation";

const recorder = fileURLToPath(new URL("./tests/browser/diagnostics/startup_recorder.ts", import.meta.url));
const manifest = new Map<string, unknown>();

const diagnosticPlugin: Plugin = {
  name: "breditor-startup-diagnostics", enforce: "pre",
  transform(code, id) {
    if (id.endsWith("/harness/selection-production/main.ts")) {
      return `import { readStartupRejections } from ${JSON.stringify(recorder)};\n${code}\nObject.assign(window, { breditorStartupDiagnostics: readStartupRejections });`;
    }
    const instrumented = instrumentStartupModule(code, id, recorder);
    if (instrumented === null) return null;
    manifest.set(id.split("/").at(-1)!, { sourceSha256: instrumented.sourceSha256, sites: instrumented.sites });
    return { code: instrumented.code, map: null };
  },
  generateBundle() {
    if (manifest.size !== 5) throw new Error(`Expected five boundary diagnostic modules, found ${manifest.size}`);
    this.emitFile({ type: "asset", fileName: "startup-diagnostic-map.json",
      source: JSON.stringify({ version: 1, modules: Object.fromEntries(manifest) }, null, 2) });
  },
};

/** Opt-in investigation build only. Public packages and normal builds are untouched. */
export default mergeConfig(base, {
  plugins: [diagnosticPlugin],
  build: { outDir: fileURLToPath(new URL("./target/startup-diagnostics", import.meta.url)) },
});
