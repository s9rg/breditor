import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Independent control, not a replacement for the full startup/selection oracle. */
export default defineConfig({
  ...base,
  testMatch: "diagnostics/property-isolation.spec.ts",
  testIgnore: ["**/harness/**", "**/*.test.ts"],
  outputDir: "./target/playwright-property-isolation-results",
  repeatEach: 20,
  maxFailures: 1,
  use: { ...base.use, baseURL: "http://127.0.0.1:4179" },
  webServer: {
    command: "vite preview --config vite.property-isolation.config.ts --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179", reuseExistingServer: false, timeout: 30_000,
  },
});
