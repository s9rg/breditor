import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Complete the bounded comparison matrix even when a variant fails. Zero retries. */
export default defineConfig({
  ...base,
  testMatch: "diagnostics/number-transport.spec.ts",
  testIgnore: ["**/harness/**", "**/*.test.ts"],
  outputDir: "./target/playwright-number-transport-results",
  repeatEach: 5,
  maxFailures: 0,
  use: { ...base.use, baseURL: "http://127.0.0.1:4179" },
  webServer: {
    command: "vite preview --config vite.number-transport.config.ts --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179", reuseExistingServer: false, timeout: 30_000,
  },
});
