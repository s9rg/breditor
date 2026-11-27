import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env["BREDITOR_CSP_PORT"] ?? 49_791);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  throw new Error("Invalid BREDITOR_CSP_PORT");
}

/** Strict Content Security Policy gate; build first with `npm run test:csp`. */
export default defineConfig({
  testDir: "./tests/csp",
  outputDir: "./target/playwright-csp-results",
  globalTimeout: 5 * 60_000,
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
    // Never bypass: the gate is the browser enforcing the served header.
    bypassCSP: false,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node tests/csp/serve.mjs",
    url: `http://127.0.0.1:${PORT}/`,
    env: { BREDITOR_CSP_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
