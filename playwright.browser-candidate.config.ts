import {defineConfig} from "@playwright/test";
import base from "./playwright.config.js";

/** Same browser cases, limits and assertions; only the served packages differ. */
export default defineConfig({...base,
  outputDir: "./target/playwright-browser-candidate-results",
  use: {...base.use, baseURL: "http://127.0.0.1:4195"},
  webServer: {
    command: "vite -c vite.browser-candidate.config.ts --host 127.0.0.1 --port 4195 --strictPort --force",
    url: "http://127.0.0.1:4195", reuseExistingServer: false, timeout: 30_000,
  },
});
