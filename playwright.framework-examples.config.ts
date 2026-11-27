import { defineConfig, devices } from "@playwright/test";

// Serves the prebuilt vanilla, Custom Element and Vue examples. Build them first with
// `npm run build:examples:frameworks` (the `test:examples:frameworks` script does both).
const examples = [
  { name: "vanilla", port: 4211 },
  { name: "web-component", port: 4212 },
  { name: "vue", port: 4213 },
] as const;

export default defineConfig({
  testDir: "./tests/framework-examples",
  outputDir: "./target/playwright-framework-examples-results",
  globalTimeout: 4 * 60_000,
  timeout: 40_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, forbidOnly: true, retries: 0, workers: 1,
  reporter: [["line"]],
  use: { actionTimeout: 5_000, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: examples.map(({ name, port }) => ({
    command: `vite preview examples/${name} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 30_000,
  })),
});
