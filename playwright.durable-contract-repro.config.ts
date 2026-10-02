import { defineConfig } from "@playwright/test";
import diagnostics from "./playwright.link-diagnostics.config";

export default defineConfig({ ...diagnostics,
  testIgnore: ["**/harness/**"],
  testMatch: "**/diagnostics/durable-contract-repro.spec.ts",
  outputDir: "./target/playwright-durable-contract-repro",
  maxFailures: 0,
});
