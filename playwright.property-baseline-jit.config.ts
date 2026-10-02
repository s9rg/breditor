import { defineConfig } from "@playwright/test";
import base from "./playwright.property-no-jit.config";

/** Disable only JS optimizing tiers; keep baseline/Wasm JIT enabled. Not qualification. */
export default defineConfig({
  ...base,
  outputDir: "./target/playwright-property-baseline-jit-results",
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:4181",
    launchOptions: {
      ...base.use?.launchOptions,
      env: {
        ...base.use?.launchOptions?.env,
        JSC_useJIT: "true", __XPC_JSC_useJIT: "true",
        JSC_useDFGJIT: "false", __XPC_JSC_useDFGJIT: "false",
        JSC_useFTLJIT: "false", __XPC_JSC_useFTLJIT: "false",
      },
    },
  },
  webServer: {
    ...base.webServer,
    command: "vite preview --config vite.property-isolation.config.ts --host 127.0.0.1 --port 4181 --strictPort",
    url: "http://127.0.0.1:4181",
  },
});
