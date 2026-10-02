import { defineConfig } from "@playwright/test";
import diagnostics from "./playwright.link-diagnostics.config";

/** Isolate the rejecting boundary. Preserve deadlines, retries=0 and workers=1. */
export default defineConfig({ ...diagnostics,
  testIgnore: ["**/harness/**"],
  testMatch: "**/diagnostics/selection-endpoint-repro.spec.ts",
  outputDir: "./target/playwright-endpoint-repro",
  maxFailures: 0,
});
