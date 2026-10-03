import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
import { selectionU32Mode } from "./tests/browser/diagnostics/selection_u32_candidate_plugin";

const mode = selectionU32Mode();
export default defineConfig<{ restoreIterations: number }>({ ...base,
  testMatch: ["clipboard-boundary.spec.ts", "selection-restore.spec.ts"],
  maxFailures: 1,
  metadata: { selectionU32: mode, logging: false },
  outputDir: `./target/playwright-selection-u32-logger-free-${mode}`,
  use: { ...base.use, baseURL: "http://127.0.0.1:4271", restoreIterations: 10000, trace: "on" },
  webServer: { command: "vite -c vite.selection-u32-candidate.config.ts --host 127.0.0.1 --port 4271 --strictPort --force",
    url: "http://127.0.0.1:4271", reuseExistingServer: false, timeout: 30000 },
});
