import { defineConfig } from "@playwright/test";
import diagnostics from "./playwright.link-diagnostics.config";

/** No editor modules are loaded by this blank-page comparison control. */
export default defineConfig({ ...diagnostics,
  testIgnore: ["**/harness/**"],
  testMatch: "**/diagnostics/numeric-range-repro.spec.ts",
  outputDir: "./target/playwright-numeric-range-repro",
  maxFailures: 0,
});
