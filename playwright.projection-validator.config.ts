import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({ ...base,
  testIgnore: ["**/harness/**"],
  testMatch: ["**/diagnostics/projection-validator.spec.ts"],
  maxFailures: 1,
  outputDir: "./target/playwright-projection-validator",
  use: { ...base.use, baseURL: "http://127.0.0.1:4221", trace: "on" },
  webServer: { command: "vite --config vite.projection-validator.config.ts --host 127.0.0.1 --port 4221 --strictPort --force",
    url: "http://127.0.0.1:4221", reuseExistingServer: false, timeout: 30_000 },
});
