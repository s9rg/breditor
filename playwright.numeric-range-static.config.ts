import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { jscTierEnvironment } from "./tests/browser/diagnostics/jsc_tier_control";

const mode = process.env["BREDITOR_RANGE_JSC_MODE"] ?? "normal";
const variant = process.env["BREDITOR_RANGE_VARIANT"] ?? "original";
if (!["original", "staged", "tagged", "int32", "indexed", "storage-capture"].includes(variant)) throw new Error("Unknown range diagnostic variant");
const env = jscTierEnvironment(mode, process.env);
if (variant === "storage-capture") {
  if (mode !== "no-jit") throw new Error("Storage capture requires the no-JIT diagnostic mode");
  // Disposable loopback test browser only. Never changes installed settings.
  env["JSC_useDollarVM"] = "true";
  env["__XPC_JSC_useDollarVM"] = "true";
}
export default defineConfig({ ...base,
  testIgnore: ["**/harness/**"], testMatch: "**/diagnostics/numeric-range-static.spec.ts",
  metadata: { numericRangeJscMode: mode, numericRangeVariant: variant }, maxFailures: 0,
  outputDir: `./target/numeric-range-static-${mode}`,
  use: { ...base.use, baseURL: "http://127.0.0.1:4240",
    launchOptions: { env } },
  webServer: { command: "node scripts/serve-range-repro.mjs", url: "http://127.0.0.1:4240",
    reuseExistingServer: false, timeout: 30_000 },
});
