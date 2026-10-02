import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** Standalone comparison-only bundle: no imports from any Breditor package. */
export default defineConfig({
  root: fileURLToPath(new URL("./tests/browser/harness/number-transport", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./target/number-transport", import.meta.url)),
    emptyOutDir: true, minify: true, sourcemap: true,
  },
});
