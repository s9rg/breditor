import { defineConfig } from "@playwright/test";
import base from "./playwright.selection-production-stress.config";

/** Same oracle, timeouts, normal optimization and zero retries; bounded debug attachments. */
export default defineConfig<{ startupDiagnostics: boolean }>({
  ...base,
  outputDir: "./target/playwright-startup-diagnostics-results",
  repeatEach: 20,
  webServer: {
    ...base.webServer,
    command: "vite preview --config vite.startup-diagnostics.config.ts --host 127.0.0.1 --port 4178 --strictPort",
    url: "http://127.0.0.1:4178",
  },
  use: { ...base.use, baseURL: "http://127.0.0.1:4178", startupDiagnostics: true },
});
