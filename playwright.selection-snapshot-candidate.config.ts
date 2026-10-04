import {defineConfig} from "@playwright/test";
import candidate from "./playwright.browser-candidate.config.js";

/** Preserve direct numeric transfer and retain the same page result for diagnosis.
 * Uses private qualified packages; no shipping build, retries or relaxed limits.
 * Keep the full suite available to reproduce prior-worker warm-up. Pass
 * tests/browser/long-document.spec.ts on the CLI for a focused cold-worker run.
 */
export default defineConfig<{directRetainedSelectionTransfer: boolean}>({
  ...candidate,
  outputDir: "./target/playwright-selection-snapshot-candidate",
  use: {...candidate.use, directRetainedSelectionTransfer: true},
});
