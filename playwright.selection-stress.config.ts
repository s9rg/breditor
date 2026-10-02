import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Investigative gate: normal browser optimization, standard timeouts, no retries. */
export default defineConfig<{ restoreIterations: number }>({
  ...base,
  testMatch: "selection-restore.spec.ts",
  outputDir: "./target/playwright-selection-stress-results",
  repeatEach: 10,
  maxFailures: 1,
  use: { ...base.use, restoreIterations: 10_000 },
});
