import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { realpathSync, readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repository = realpathSync(fileURLToPath(new URL(".", import.meta.url)));
const source = process.env["BREDITOR_FLAT_LIST_BINDINGS"];
if (!source) throw new Error("Set BREDITOR_FLAT_LIST_BINDINGS to the candidate printed by npm run test:lists:experimental.");
const candidate = realpathSync(resolve(repository, source));
const local = relative(repository, candidate);
if (!local.startsWith(`target${sep}`) || local.split(sep).includes("..")) throw new Error("List candidate must be inside this repository's target directory.");
const qualification = JSON.parse(readFileSync(resolve(candidate, "qualification.json"), "utf8"));
const hash = createHash("sha256").update(readFileSync(resolve(candidate, "breditor_wasm_bg.wasm"))).digest("hex");
if (qualification.status !== "passed" || qualification.feature !== "experimental-flat-lists" || qualification.wasmSha256 !== hash) {
  throw new Error("List candidate has not passed experimental qualification or has changed.");
}

export default defineConfig(({ mode }) => ({
  root: resolve(repository, "examples/lists"),
  plugins: [react()],
  define: { __BREDITOR_FLAT_LIST_WASM_SHA256__: JSON.stringify(hash) },
  resolve: { alias: [
    { find: /^@breditor\/browser$/, replacement: resolve(repository, "packages/breditor-browser/src/index.ts") },
    { find: "@breditor/browser/advanced", replacement: resolve(repository, "packages/breditor-browser/src/advanced.ts") },
    { find: "@breditor/wasm", replacement: resolve(candidate, "breditor_wasm.js") },
    { find: "./demoProfile.js", replacement: resolve(repository, "examples/lists/profile.ts") },
  ] },
  server: { host: "127.0.0.1", fs: { allow: [repository] } },
  // Native qualification may keep the ordinary preview open while Playwright
  // builds a newer candidate. Never replace that preview's artifact in place.
  build: { outDir: resolve(repository, mode === "qualification" ? "target/list-demo-qualification" : "target/list-demo"), emptyOutDir: true,
    rolldownOptions: { input: {
      demo: resolve(repository, "examples/lists/index.html"),
      clipboard: resolve(repository, "examples/lists/manual-clipboard.html"),
    } },
    modulePreload: { polyfill: false }, target: "es2022" },
}));
