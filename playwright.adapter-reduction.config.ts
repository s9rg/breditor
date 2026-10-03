import { defineConfig } from "@playwright/test";
import base from "./playwright.impact-contract.config";

export default defineConfig({ ...base,
  testMatch: ["**/diagnostics/boundary-history-adapter.spec.ts"],
  outputDir: "./target/playwright-adapter-reduction",
  use: { ...base.use, baseURL: "http://127.0.0.1:4222", trace: "on" },
  webServer: { command: "vite --config vite.adapter-reduction.config.ts --host 127.0.0.1 --port 4222 --strictPort --force",
    url: "http://127.0.0.1:4222", reuseExistingServer: false, timeout: 30_000 },
});
