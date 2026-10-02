import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** Minified isolated benchmark; not an editor build or correctness oracle. */
export default defineConfig({
  root: fileURLToPath(new URL("./tests/browser/harness/boundary-cost", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./target/boundary-cost", import.meta.url)),
    emptyOutDir: true,
    minify: true,
  },
});
