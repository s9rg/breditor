import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Separate opt-in host; preserve ordinary test order, assertions and timeouts.
 * CLI file filters can isolate Link after a full-matrix reproduction attempt.
 */
export default defineConfig({ ...base,
  outputDir: "./target/playwright-link-diagnostics", maxFailures: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:4216" },
  webServer: { command: "vite -c vite.link-diagnostics.config.ts --host 127.0.0.1 --port 4216 --strictPort",
    url: "http://127.0.0.1:4216", reuseExistingServer: false, timeout: 30_000 },
});
