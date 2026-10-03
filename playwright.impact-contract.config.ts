import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Raw Wasm and production-adapter controls without the full editor owner. */
export default defineConfig({ ...base,
  testIgnore: ["**/harness/**"],
  testMatch: ["**/diagnostics/impact-contract.spec.ts", "**/diagnostics/impact-adapter.spec.ts"],
  maxFailures: 1,
  outputDir: "./target/playwright-impact-contract",
});
