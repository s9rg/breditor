import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Observe either four queue catches or its single stop method; callers stay unchanged. */
export default defineConfig({ ...base,
  maxFailures: 1,
  outputDir: "./target/playwright-queue-diagnostics",
  use: { ...base.use, baseURL: "http://127.0.0.1:4218" },
  webServer: {
    command: "vite -c vite.queue-diagnostics.config.ts --host 127.0.0.1 --port 4218 --strictPort --force",
    url: "http://127.0.0.1:4218", reuseExistingServer: false, timeout: 30_000,
  },
});
