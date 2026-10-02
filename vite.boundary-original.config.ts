import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import runtime from "./vite.selection-stress.config";
import { legacyBoundaryBuildGuard } from "./tests/browser/diagnostics/legacy_boundary_build_guard";

/** Preview preserved original bytes; never relabel the integrated runtime. */
export default mergeConfig(runtime, {
  plugins: [legacyBoundaryBuildGuard()],
  build: { outDir: fileURLToPath(new URL("./target/selection-stress-production", import.meta.url)) },
});
