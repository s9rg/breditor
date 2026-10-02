import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Serial engines and normal deadlines; run without concurrent stress jobs. */
export default defineConfig({
  ...base,
  testDir: "./tests/browser/diagnostics",
  testIgnore: [],
  testMatch: "boundary-cost.spec.ts",
  outputDir: "./target/playwright-boundary-cost",
  use: { ...base.use, baseURL: "http://127.0.0.1:4207" },
  webServer: {
    command: "vite preview -c vite.boundary-cost.config.ts --host 127.0.0.1 --port 4207 --strictPort",
    url: "http://127.0.0.1:4207",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
