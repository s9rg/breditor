import { defineConfig } from "@playwright/test";
import base from "./playwright.property-no-jit.config";

/** Keep JS JIT enabled but interpret Wasm. Hypothesis control, never qualification. */
export default defineConfig({
  ...base,
  outputDir: "./target/playwright-property-wasm-interpreter-results",
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:4190",
    launchOptions: {
      ...base.use?.launchOptions,
      env: {
        ...base.use?.launchOptions?.env,
        JSC_useJIT: "true", __XPC_JSC_useJIT: "true",
        JSC_useBBQJIT: "false", __XPC_JSC_useBBQJIT: "false",
        JSC_useOMGJIT: "false", __XPC_JSC_useOMGJIT: "false",
        JSC_useWasmIPInt: "true", __XPC_JSC_useWasmIPInt: "true",
      },
    },
  },
  webServer: {
    ...base.webServer,
    command: "vite preview --config vite.property-isolation.config.ts --host 127.0.0.1 --port 4190 --strictPort",
    url: "http://127.0.0.1:4190",
  },
});
