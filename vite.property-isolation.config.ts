import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { instrumentStartupModule } from "./tests/browser/diagnostics/startup_instrumentation";

const descriptor = fileURLToPath(new URL("./packages/breditor-browser/dist/wasm_profile_descriptor.js", import.meta.url));
const recorder = fileURLToPath(new URL("./tests/browser/diagnostics/startup_recorder.ts", import.meta.url));
const virtualId = "virtual:breditor-property-validator";
let mapping: unknown;

const plugin: Plugin = {
  name: "breditor-property-isolation", enforce: "pre",
  resolveId(id) { return id === virtualId ? `\0${virtualId}` : null; },
  load(id) {
    if (id !== `\0${virtualId}`) return null;
    return `export { __breditorValidateProperty as validateProperty } from ${JSON.stringify(descriptor)};`;
  },
  transform(code, id) {
    if (id !== descriptor) return null;
    const output = instrumentStartupModule(code, id, recorder);
    if (output === null) throw new Error("Property validator instrumentation missing");
    mapping = { version: 1, sourceSha256: output.sourceSha256, sites: output.sites };
    return { code: `${output.code}\nexport { readFormatPropertyValueType as __breditorValidateProperty };`, map: null };
  },
  generateBundle() {
    if (mapping === undefined) throw new Error("Property isolation transform did not run");
    this.emitFile({ type: "asset", fileName: "property-diagnostic-map.json", source: JSON.stringify(mapping, null, 2) });
  },
};

/** Private validator exposure exists only in this standalone diagnostic build. */
export default defineConfig({
  root: fileURLToPath(new URL("./tests/browser/harness/property-isolation", import.meta.url)),
  plugins: [plugin],
  build: { outDir: fileURLToPath(new URL("./target/property-isolation", import.meta.url)), emptyOutDir: true, minify: true },
});
