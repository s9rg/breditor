import { defineConfig } from "@playwright/test";
import diagnostics from "./playwright.link-diagnostics.config";

/** Blank-page protocol control; no Breditor runtime is loaded. */
export default defineConfig({ ...diagnostics,
  testIgnore: ["**/harness/**"],
  testMatch: "**/diagnostics/numeric-return-repro.spec.ts",
  outputDir: "./target/playwright-numeric-return-repro",
  maxFailures: 0,
});
