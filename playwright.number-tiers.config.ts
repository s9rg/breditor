import { defineConfig } from "@playwright/test";
import base from "./playwright.property-transport.config";
import { jscTierEnvironment, jscTierModes } from "./tests/browser/diagnostics/jsc_tier_control";

if (process.env["BREDITOR_NUMBER_VARIANT"] !== "js-cold-minimal") throw new Error("Tier control requires the preserved js-cold-minimal build");
const mode = process.env["BREDITOR_JSC_TIER"] ?? "normal";
const logCompilation = process.env["BREDITOR_JSC_LOG"];
if (logCompilation !== undefined && logCompilation !== "1") throw new Error("BREDITOR_JSC_LOG must be 1 or unset");
const env = jscTierEnvironment(mode, process.env, logCompilation === "1");
const port = 4220 + jscTierModes.indexOf(mode as typeof jscTierModes[number]);

/** Same static JS bytes in every mode. These engine flags are not release fixes. */
export default defineConfig({
  ...base,
  metadata: { numberTransportVariant: "js-cold-minimal", jscTier: mode },
  outputDir: `./target/playwright-number-tiers-${mode}-results`,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}`, launchOptions: { env } },
  webServer: {
    ...base.webServer,
    command: `vite preview --config vite.property-transport.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
  },
});
