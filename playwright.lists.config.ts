import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env["BREDITOR_LIST_TEST_PORT"] ?? "4187");
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error("BREDITOR_LIST_TEST_PORT must be an integer in 1024..65535");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/lists",
  outputDir: "./target/playwright-list-demo-results",
  globalTimeout: 4 * 60_000,
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, forbidOnly: true, retries: 0, workers: 1,
  reporter: [["line"]],
  use: { baseURL, actionTimeout: 5_000,
    screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `npm run build:demo:lists && vite preview --config vite.lists.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, timeout: 30_000,
  },
});
