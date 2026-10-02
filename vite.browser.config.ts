import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** Ordinary integration pages; opt-in diagnostics have their own Vite plugins. */
export default defineConfig({
  root: fileURLToPath(new URL("./tests/browser/harness", import.meta.url)),
  optimizeDeps: {
    // Vite's default recursive HTML scan also finds property-isolation/index.html,
    // whose virtual validator only exists in its dedicated diagnostic build.
    entries: ["index.html", "manual-clipboard.html", "selection-endpoint.html"],
  },
});
