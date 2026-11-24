import { defineConfig } from "@playwright/test";
import base from "./playwright.startup-diagnostics.config";

/** Run each deterministic control once without replacing the stress-run trace. */
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/startup-projection-rejection.spec.ts",
  outputDir: "./target/playwright-startup-projection-control-results",
  repeatEach: 1,
});
