import { defineConfig } from "@playwright/test";
import base from "./playwright.selection-production-stress.config";

const variant = process.env["BREDITOR_BOUNDARY_VARIANT"] ?? "original";
if (!["original", "normalized", "runtime"].includes(variant)) {
  throw new Error("BREDITOR_BOUNDARY_VARIANT must be original, normalized or runtime");
}
const port = variant === "original" ? 4196 : variant === "normalized" ? 4195 : 4213;
const config = variant === "original" ? "vite.boundary-original.config.ts" : variant === "normalized" ? "vite.numeric-normalization.config.ts" : "vite.selection-stress.config.ts";

/** Paired full-consumer qualification, not the reduced Object.is comparison.
 * Same oracle, normal browser options, five cases, original timeouts, no retries.
 * Separate output paths/ports prevent candidate and control evidence collision.
 */
export default defineConfig({
  ...base,
  repeatEach: 5,
  outputDir: `./target/playwright-boundary-${variant}-results`,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    ...base.webServer,
    command: `vite preview --config ${config} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
