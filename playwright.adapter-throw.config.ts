import { defineConfig } from "@playwright/test";
import queue from "./playwright.queue-diagnostics.config";

if (process.env["BREDITOR_QUEUE_ADAPTER_THROWS"] !== "1" || process.env["BREDITOR_QUEUE_CAPTURE"] !== "stop" ||
    process.env["BREDITOR_QUEUE_SELECTION"] !== "1" || process.env["BREDITOR_QUEUE_PROJECTION"] !== "1") {
  throw new Error("Adapter controls require BREDITOR_QUEUE_ADAPTER_THROWS=1, BREDITOR_QUEUE_CAPTURE=stop, BREDITOR_QUEUE_SELECTION=1 and BREDITOR_QUEUE_PROJECTION=1");
}

/** Injected constructor/selection rejections, separate from natural fault reproductions. */
export default defineConfig({ ...queue,
  testIgnore: ["**/harness/**"],
  testMatch: "**/diagnostics/adapter-throw.spec.ts",
  outputDir: "./target/playwright-adapter-throw-control",
});
