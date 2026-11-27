import { defineConfig } from "vite";

export default defineConfig({
  build: { modulePreload: { polyfill: false }, target: "es2022" },
});
