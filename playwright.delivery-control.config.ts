import { defineConfig } from "@playwright/test";
import base from "./playwright.queue-diagnostics.config";

/** Deliberate failure control only; never part of the ordinary regression order. */
export default defineConfig({ ...base,
  testIgnore: [], testMatch: "**/diagnostics/delivery-control.spec.ts",
  outputDir: "./target/playwright-delivery-control",
  webServer: {
    ...base.webServer,
    command: "BREDITOR_QUEUE_DELIVERY=1 vite -c vite.queue-diagnostics.config.ts --host 127.0.0.1 --port 4218 --strictPort --force",
  },
});
