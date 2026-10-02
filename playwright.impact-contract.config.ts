import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Raw Wasm control only; deliberately excludes the full editor's diagnostics. */
export default defineConfig({ ...base,
  testIgnore: ["**/harness/**"],
  testMatch: "**/diagnostics/impact-contract.spec.ts",
  maxFailures: 1,
  outputDir: "./target/playwright-impact-contract",
});
