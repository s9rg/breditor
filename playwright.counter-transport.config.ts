import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Keep the original direct-number transport available as a separate diagnostic. */
export default defineConfig<{ directCounterTransport: boolean }>({
  ...base,
  testMatch: "**/editor.spec.ts",
  grep: /detached toolbar buttons/,
  outputDir: "./target/playwright-counter-transport",
  maxFailures: 3,
  use: { ...base.use, directCounterTransport: true },
});
