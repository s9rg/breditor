import { defineConfig } from "@playwright/test";
import base from "./playwright.property-transport.config";

/** Diagnostic control: same selected source bundle, all JIT disabled, no retries. */
export default defineConfig({
  ...base,
  outputDir: "./target/playwright-property-transport-no-jit-results",
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:4201",
    launchOptions: {
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        JSC_useJIT: "false", __XPC_JSC_useJIT: "false",
        JSC_dumpOptions: "1", __XPC_JSC_dumpOptions: "1",
      },
    },
  },
  webServer: {
    ...base.webServer,
    command: "vite preview --config vite.property-transport.config.ts --host 127.0.0.1 --port 4201 --strictPort",
    url: "http://127.0.0.1:4201",
  },
});
