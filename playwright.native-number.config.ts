import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Same visible runner used in installed Safari; no direct probe evaluation. */
export default defineConfig({
  ...base,
  testMatch: "diagnostics/native-number-runner.spec.ts",
  testIgnore: ["**/harness/**", "**/*.test.ts"],
  outputDir: "./target/playwright-native-number-results",
  maxFailures: 1,
  webServer: {
    command: "node scripts/serve-number-repro.mjs js-dataview-bare",
    url: "http://127.0.0.1:4202/",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
