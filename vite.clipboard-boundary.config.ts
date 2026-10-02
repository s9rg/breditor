import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import normalized from "./vite.numeric-normalization.config";
import browser from "./vite.browser.config";
import { legacyBoundaryBuildGuard } from "./tests/browser/diagnostics/legacy_boundary_build_guard";

const variant = process.env["BREDITOR_BOUNDARY_VARIANT"] ?? "original";
if (!["original", "normalized", "runtime"].includes(variant)) throw new Error("Expected original, normalized or runtime boundary variant");
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/** Real interactive harness and native clipboard page; no assertion rewrites.
 * runtime: no transform; original/normalized: preserved historical controls.
 */
export default mergeConfig(variant === "normalized" ? normalized : defineConfig({}), {
  plugins: variant === "original" ? [legacyBoundaryBuildGuard()] : [],
  root: path("./tests/browser/harness"),
  optimizeDeps: browser.optimizeDeps,
  build: {
    outDir: path(`./target/clipboard-boundary-${variant}`),
    emptyOutDir: true,
    minify: true,
    rolldownOptions: { input: {
      index: path("./tests/browser/harness/index.html"),
      manual: path("./tests/browser/harness/manual-clipboard.html"),
    } },
  },
});
