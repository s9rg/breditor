import {defineConfig} from "@playwright/test";
import base from "./playwright.demo.config.js";

/** Existing application cases and deadlines against a private production build. */
export default defineConfig({...base,
  outputDir: "./target/playwright-demo-candidate-results",
  use: {...base.use, baseURL: "http://127.0.0.1:4196"},
  webServer: {
    command: "vite build -c vite.demo-candidate.config.ts && vite preview -c vite.demo-candidate.config.ts --host 127.0.0.1 --port 4196 --strictPort",
    url: "http://127.0.0.1:4196", reuseExistingServer: false, timeout: 30_000,
  },
});
