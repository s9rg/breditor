import { fileURLToPath } from "node:url";
import { mergeConfig, type Plugin } from "vite";
import base from "./vite.selection-stress.config";
import { transformNumericConsumer } from "./tests/browser/diagnostics/numeric_consumer_transform";
import { legacyBoundaryBuildGuard } from "./tests/browser/diagnostics/legacy_boundary_build_guard";

const helper = fileURLToPath(new URL("./tests/browser/diagnostics/normalize_boundary_number.ts", import.meta.url));
const modules = new Map<string, unknown>();
const plugin: Plugin = {
  name: "breditor-numeric-normalization-candidate", enforce: "pre",
  transform(code, id) {
    const result = transformNumericConsumer(code, id, helper);
    if (result === null) return null;
    modules.set(id.split("/").at(-1)!, { sourceSha256: result.sourceSha256, sites: result.sites });
    return { code: result.code, map: null };
  },
  generateBundle() {
    if (modules.size !== 2) throw new Error("Expected both numeric boundary modules");
    this.emitFile({ type: "asset", fileName: "numeric-normalization-map.json", source: JSON.stringify({ version: 1, modules: Object.fromEntries(modules) }, null, 2) });
  },
};

/** Historical candidate: preview preserved artifacts; rebuilding integrated
 * sources is rejected before cleanup. Current runtime uses the base config.
 */
export default mergeConfig(base, {
  plugins: [legacyBoundaryBuildGuard(), plugin],
  build: { outDir: fileURLToPath(new URL("./target/numeric-normalization", import.meta.url)) },
});
