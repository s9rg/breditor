import { defineConfig } from "@playwright/test";
import base from "./playwright.property-isolation.config";
import { propertyNumberVariant, propertyNumberVariants } from "./tests/browser/diagnostics/property_transport_variant";

const variant = propertyNumberVariant(process.env["BREDITOR_NUMBER_VARIANT"]);
// Leave the native runner's port 4202 undisturbed.
const port = variant === "js-cold-minimal" ? 4210 : 4191 + propertyNumberVariants.indexOf(variant);

/** Repeat every variant independently; expected negative controls remain failed tests. */
export default defineConfig({
  ...base,
  metadata: { numberTransportVariant: variant },
  outputDir: `./target/playwright-property-transport-${variant}-results`,
  repeatEach: 5,
  maxFailures: 0,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    ...base.webServer,
    command: `vite preview --config vite.property-transport.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
  },
});
