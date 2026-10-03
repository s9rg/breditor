import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Isolated paired microbenchmark. Run without concurrent stress/build jobs. */
export default defineConfig({ ...base, testIgnore: [],
  testMatch: "**/diagnostics/selection-u32-cost.spec.ts",
  outputDir: "./target/playwright-selection-u32-cost", webServer: [],
});
