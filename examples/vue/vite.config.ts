import { defineConfig } from "vite";

export default defineConfig({
  // Render-function components need no compiler plugin. These flags select Vue's
  // tree-shaken production behavior and silence its esm-bundler feature-flag warning.
  define: {
    __VUE_OPTIONS_API__: "false",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  build: { modulePreload: { polyfill: false }, target: "es2022" },
});
