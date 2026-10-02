import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Same 3,000-restore oracle as the failed ordinary matrix, without minification. */
export default defineConfig<{ startupDiagnostics: boolean }>({
  ...base,
  outputDir: "./target/playwright-startup-development-diagnostics",
  maxFailures: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:4217", startupDiagnostics: true },
  webServer: {
    command: "vite -c vite.startup-development-diagnostics.config.ts --host 127.0.0.1 --port 4217 --strictPort --force",
    url: "http://127.0.0.1:4217", reuseExistingServer: false, timeout: 30_000,
  },
});
