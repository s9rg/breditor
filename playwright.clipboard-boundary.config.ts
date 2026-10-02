import { defineConfig } from "@playwright/test";
import base from "./playwright.clipboard-stress.config";

const variant = process.env["BREDITOR_BOUNDARY_VARIANT"] ?? "original";
if (!["original", "normalized", "runtime"].includes(variant)) throw new Error("Expected original, normalized or runtime boundary variant");
const port = variant === "original" ? 4204 : variant === "normalized" ? 4205 : 4211;

/** Controlled events and real DOM selection, not trusted OS clipboard proof.
 * Retain the original oracles, timeouts, single worker, zero retries and stop
 * on first failure. CLI repeat-each may request a separate bounded stress run.
 */
export default defineConfig({
  ...base,
  testMatch: [...base.testMatch as string[], "manual-clipboard.spec.ts"],
  grep: new RegExp(`${(base.grep as RegExp).source}|manual (fixture|recorder)`),
  repeatEach: 1,
  outputDir: `./target/playwright-clipboard-boundary-${variant}`,
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    command: `vite preview --config vite.clipboard-boundary.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
