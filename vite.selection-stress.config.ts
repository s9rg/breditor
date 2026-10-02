import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** Production-minified consumer, with the normal packaged Wasm/glue. */
export default defineConfig({
  root: fileURLToPath(new URL("./tests/browser/harness/selection-production", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./target/selection-runtime-production", import.meta.url)),
    emptyOutDir: true,
    minify: true,
  },
});
