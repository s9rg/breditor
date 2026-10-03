import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import base from "./vite.browser.config";
import { exposeProjectionValidator } from "./tests/browser/diagnostics/projection_validator_export";
import { exposeSelectionValidators } from "./tests/browser/diagnostics/selection_validator_export";

const projection = fileURLToPath(new URL("./packages/breditor-browser/dist/projection.js", import.meta.url));
const selection = fileURLToPath(new URL("./packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url));
/** No Wasm initialization, production-code replacement, or rejection instrumentation. */
export default defineConfig({ ...base, plugins: [{
  name: "isolated-projection-validator",
  resolveId(id) { return ["virtual:breditor-projection-validator", "virtual:breditor-selection-validator"].includes(id) ? "\0" + id : null; },
  load(id) {
    if (id === "\0virtual:breditor-projection-validator") {
      return `export { diagnosticValidateFormatDetails } from ${JSON.stringify(projection)};`;
    }
    if (id === "\0virtual:breditor-selection-validator") {
      return `export { diagnosticIsU32, diagnosticReadPoint } from ${JSON.stringify(selection)};`;
    }
    return null;
  },
  transform(code, id) { return exposeProjectionValidator(code, id)?.code ?? exposeSelectionValidators(code, id)?.code; },
}] });
