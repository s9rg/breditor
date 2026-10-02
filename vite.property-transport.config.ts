import { fileURLToPath } from "node:url";
import { mergeConfig, type Plugin } from "vite";
import base from "./vite.property-isolation.config";
import { propertyNumberVariant, transformPropertyNumberSource } from "./tests/browser/diagnostics/property_transport_variant";

const variant = propertyNumberVariant(process.env["BREDITOR_NUMBER_VARIANT"]);
let transformed = 0;
const plugin: Plugin = {
  name: "breditor-property-number-variant", enforce: "pre",
  transform(code, id) {
    const output = transformPropertyNumberSource(code, id, variant);
    if (output === null) return null;
    transformed++;
    return { code: output, map: null };
  },
  generateBundle(_options, bundle) {
    const expected = variant === "f64" ? 0 : ["js-dataview-strict", "js-dataview-bare", "js-only", "js-cold-branch", "js-cold-minimal"].includes(variant) ? 2 : 1;
    if (transformed !== expected) throw new Error(`Expected ${expected} variant transformations, got ${transformed}`);
    if (["js-only", "js-cold-branch", "js-cold-minimal"].includes(variant)) {
      const chunks = Object.values(bundle).filter(item => item.type === "chunk");
      if (chunks.length !== 1 || chunks.some(chunk => chunk.imports.length !== 0 || chunk.dynamicImports.length !== 0 || chunk.code.includes("WebAssembly")) ||
          Object.keys(bundle).some(name => name.endsWith(".wasm"))) {
        throw new Error("JavaScript-only reduction retained module dependencies or WebAssembly");
      }
    }
    this.emitFile({ type: "asset", fileName: "number-transport-variant.json", source: JSON.stringify({ variant, transformed }) });
  },
};

export default mergeConfig(base, {
  plugins: [plugin],
  build: { outDir: fileURLToPath(new URL(`./target/property-transport/${variant}`, import.meta.url)) },
});
