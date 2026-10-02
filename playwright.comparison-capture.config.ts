import { defineConfig } from "@playwright/test";
import base from "./playwright.number-tiers.config";
import { comparisonVariants, type ComparisonVariant } from "./tests/browser/diagnostics/jsc_comparison_variants.mjs";
import { jscTierModes, type JscTierMode } from "./tests/browser/diagnostics/jsc_tier_control";

const comparison = process.env["BREDITOR_COMPARISON"] ?? "original";
if (!comparisonVariants.includes(comparison as ComparisonVariant)) throw new Error("Unknown comparison variant");
const tier = process.env["BREDITOR_JSC_TIER"] ?? "normal";
if (!jscTierModes.includes(tier as JscTierMode)) throw new Error("Unknown JSC tier");
// Separate tier runs must neither share a server nor overwrite failure traces.
const port = 4230 + 10 * jscTierModes.indexOf(tier as JscTierMode) + comparisonVariants.indexOf(comparison as ComparisonVariant);

/** Opt-in response-body control only. Never intercepts production tests. */
export default defineConfig({
  ...base,
  testMatch: "diagnostics/comparison-capture.spec.ts",
  metadata: { ...base.metadata, comparison },
  outputDir: `./target/playwright-comparison-${comparison}-${tier}-results`,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: { ...base.webServer,
    command: `vite preview --config vite.property-transport.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}` },
});
