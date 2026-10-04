import { defineConfig, devices } from "@playwright/test";

const portText = process.env["BREDITOR_HEADING_DEMO_PORT"] ?? "4186";
const port = Number(portText);
if (!/^\d{4,5}$/u.test(portText) || port < 1024 || port > 65535) throw new Error("Invalid heading demo test port");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/headings",
  outputDir: "./target/playwright-heading-demo-results",
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
    command: `npm run build:demo:headings && vite preview --config vite.headings.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL, reuseExistingServer: false, timeout: 30_000,
  },
});
