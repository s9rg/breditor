import { defineConfig } from "@playwright/test";
import base from "./playwright.adapter-reduction.config";

export default defineConfig({ ...base,
  testMatch: ["**/diagnostics/boundary-history-adapter.spec.ts", "**/diagnostics/projection-count-repro.spec.ts"],
  outputDir: "./target/playwright-selection-input-diagnostic",
  use: { ...base.use, baseURL: "http://127.0.0.1:4223" },
  webServer: { command: "vite --config vite.selection-input-diagnostic.config.ts --host 127.0.0.1 --port 4223 --strictPort --force",
    url: "http://127.0.0.1:4223", reuseExistingServer: false, timeout: 30_000 },
});
