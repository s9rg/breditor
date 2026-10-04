import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { realpathSync, readFileSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repository = realpathSync(fileURLToPath(new URL(".", import.meta.url)));
const source = process.env["BREDITOR_HEADING_BINDINGS"];
if (!source) throw new Error("Set BREDITOR_HEADING_BINDINGS to the candidate printed by npm run test:headings:experimental.");
const candidate = realpathSync(resolve(repository, source));
const local = relative(repository, candidate);
if (!local.startsWith(`target${sep}`) || local.split(sep).includes("..")) throw new Error("Heading candidate must be inside this repository's target directory.");
const qualification = JSON.parse(readFileSync(resolve(candidate, "qualification.json"), "utf8"));
const hash = createHash("sha256").update(readFileSync(resolve(candidate, "breditor_wasm_bg.wasm"))).digest("hex");
if (qualification.status !== "passed" || qualification.feature !== "experimental-text-blocks" || qualification.wasmSha256 !== hash) {
  throw new Error("Heading candidate has not passed experimental qualification or has changed.");
}

export default defineConfig({
  root: resolve(repository, "examples/headings"),
  plugins: [react()],
  resolve: { alias: [
    { find: "@breditor/wasm", replacement: resolve(candidate, "breditor_wasm.js") },
    { find: "./demoProfile.js", replacement: resolve(repository, "examples/headings/profile.ts") },
  ] },
  server: { host: "127.0.0.1", fs: { allow: [repository] } },
  build: { outDir: resolve(repository, "target/heading-demo"), emptyOutDir: true,
    modulePreload: { polyfill: false }, target: "es2022" },
});
