import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./examples/react/vite.config";
import { selectionU32CandidatePlugin, selectionU32Mode } from "./tests/browser/diagnostics/selection_u32_candidate_plugin";

const mode = selectionU32Mode();
/** Same reference application build, isolated output; never replaces the demo. */
export default mergeConfig(base, {
  root: fileURLToPath(new URL("./examples/react", import.meta.url)),
  plugins: [selectionU32CandidatePlugin(mode)],
  build: {
    outDir: fileURLToPath(new URL(`./target/selection-u32-size-${mode}`, import.meta.url)),
    emptyOutDir: true,
  },
});
