import { defineConfig, devices } from "@playwright/test";

const PORT = 4_174;

export default defineConfig({
  testDir: "./tests/demo",
  outputDir: "./target/playwright-demo-results",
  globalTimeout: 2 * 60_000,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command:
      "npm run dev --workspace @breditor/example-react -- --host 127.0.0.1 --port 4174 --strictPort --force",
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
