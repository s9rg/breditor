import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["contracts.spec.mjs", "rich-ast.spec.mjs", "rich-replica.spec.mjs", "rich-selection.spec.mjs", "text-flow.spec.mjs"],
  outputDir: "../../../target/collaboration-browser-results",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  globalTimeout: 5 * 60_000,
  forbidOnly: true,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:49772", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node experiments/collaboration/browser/serve.mjs",
    cwd: "../../..",
    url: "http://127.0.0.1:49772/",
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
