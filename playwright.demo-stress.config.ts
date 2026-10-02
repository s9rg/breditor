import { defineConfig } from "@playwright/test";
import base from "./playwright.demo.config";

/** Repeats the mixed React schedule that previously exposed WebKit runtime faults. */
export default defineConfig({
  ...base,
  testMatch: "react-demo.spec.ts",
  grep: /the React demo edits, formats, replays, persists, and remains accessible|the eleven-control Text Size Showcase|Text color applies an exact RGB24/,
  outputDir: "./target/playwright-demo-stress-results",
  globalTimeout: 8 * 60_000,
  repeatEach: 15,
  maxFailures: 1,
  // Keep individual test/action budgets, normal optimization, and zero retries.
});
