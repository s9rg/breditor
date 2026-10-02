import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import interactive from "./playwright.clipboard-boundary.config";

if (interactive.use === undefined || interactive.webServer === undefined || Array.isArray(interactive.webServer)) {
  throw new Error("Expected interactive use and a single fixture server");
}
const variant = process.env["BREDITOR_BOUNDARY_VARIANT"] ?? "original";
const port = variant === "original" ? 4209 : variant === "normalized" ? 4210 : 4212;

/** Entire ordinary browser matrix against the minified interactive boundary
 * fixture. Only the server, URL and result directory change: no narrowed grep,
 * test list, retry, timeout or assertion override from the clipboard subset.
 */
export default defineConfig({
  ...base,
  outputDir: `${interactive.outputDir}-full-matrix`,
  use: { ...interactive.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    ...interactive.webServer,
    command: `vite preview -c vite.boundary-matrix.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
  },
});
