import { defineConfig } from "@playwright/test";
import base from "./playwright.selection-production-stress.config";

export default defineConfig({
  ...base,
  outputDir: "./target/playwright-numeric-normalization-results",
  // Small batches fit the existing suite budget; aggregate only completed cases.
  repeatEach: 5,
  use: { ...base.use, baseURL: "http://127.0.0.1:4195" },
  webServer: {
    ...base.webServer,
    command: "vite preview --config vite.numeric-normalization.config.ts --host 127.0.0.1 --port 4195 --strictPort",
    url: "http://127.0.0.1:4195",
  },
});
