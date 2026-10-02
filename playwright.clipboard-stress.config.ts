import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Controlled clipboard events and real DOM selection; never the OS clipboard. */
export default defineConfig({
  ...base,
  testMatch: ["editor.spec.ts", "clipboard-boundary.spec.ts", "clipboard-lifecycle.spec.ts", "formatted-clipboard-lifecycle.spec.ts", "link-history-lifecycle.spec.ts"],
  grep: /copy, cut, and paste use guarded|repeated cuts and immediate caret|clipboard .* echoes preserve|clipboard (crossParagraph|boundaryOnly|rejected paste)|a warm Link owner retains|formatted clipboard, Link history/,
  outputDir: "./target/playwright-clipboard-stress-results",
  repeatEach: 10,
  maxFailures: 1,
});
