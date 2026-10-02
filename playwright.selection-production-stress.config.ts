import { defineConfig } from "@playwright/test";
import base from "./playwright.selection-stress.config";

/** Same oracle and budgets as the development stress run; no diagnostic transforms. */
export default defineConfig<{ restoreIterations: number; productionSelectionProbe: boolean }>({
  ...base,
  outputDir: "./target/playwright-selection-production-stress-results",
  use: { ...base.use, productionSelectionProbe: true },
  webServer: {
    command: "vite preview --config vite.selection-stress.config.ts --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
