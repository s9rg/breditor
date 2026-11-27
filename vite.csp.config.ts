import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const app = (path: string): string => fileURLToPath(new URL(`./tests/csp/app/${path}`, import.meta.url));

/**
 * Production build of the strict-CSP fixture pages. External module scripts and stylesheets only:
 * no module-preload polyfill, no inline asset data, so the host page itself needs no inline allowance.
 */
export default defineConfig({
  root: app(""),
  base: "/",
  build: {
    outDir: fileURLToPath(new URL("./target/csp-app", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rolldownOptions: { input: { index: app("index.html"), shared: app("shared.html") } },
  },
});
