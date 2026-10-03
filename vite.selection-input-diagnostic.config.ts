import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import base from "./vite.adapter-reduction.config";
import { instrumentWasmEquality } from "./tests/browser/diagnostics/wasm_equality_instrumentation";
import { instrumentWasmFormatCount } from "./tests/browser/diagnostics/wasm_format_count_instrumentation";

const selectionTokens = process.env["BREDITOR_SELECTION_TOKENS"] ?? "js";
if (selectionTokens !== "js" && selectionTokens !== "rust" && selectionTokens !== "codes") throw new Error("Invalid selection token mode");
const rustFormatCount = process.env["BREDITOR_RUST_FORMAT_COUNT"] ?? "off";
if (rustFormatCount !== "off" && rustFormatCount !== "on") throw new Error("Invalid Rust format-count observer mode");
const inputObserver = process.env["BREDITOR_RUST_SELECTION_INPUTS"] ?? "on";
if (inputObserver !== "off" && inputObserver !== "on") throw new Error("Invalid Rust selection observer mode");
const tokenVariant = selectionTokens === "rust" ? "selection-rust-token-candidate" :
  selectionTokens === "codes" ? "selection-coded-token-candidate" : "selection-input-diagnostic";
const variant = tokenVariant +
  (rustFormatCount === "on" ? "-count" : "") + (inputObserver === "off" ? "-unobserved" : "");
const diagnosticPath = fileURLToPath(new URL(`./target/${variant}/pkg/breditor_wasm.js`, import.meta.url));
const recorderPath = fileURLToPath(new URL("./tests/browser/diagnostics/wasm_equality_recorder.ts", import.meta.url));
const mode = process.env["BREDITOR_SELECTION_EQUALITY"] ?? "off";
if (mode !== "off" && mode !== "calls" && mode !== "inline") throw new Error("Invalid equality observer mode");
const formatCount = process.env["BREDITOR_PROJECTION_FORMAT_COUNT"] ?? "off";
if (formatCount !== "off" && formatCount !== "inline") throw new Error("Invalid format-count observer mode");
let manifest: object | undefined;

/** Explicit local-only Rust diagnostic build; ordinary configurations never alias Wasm. */
export default defineConfig({ ...base,
  plugins: [...base.plugins ?? [], { name: "breditor-wasm-equality-input", enforce: "pre",
    transform(code, id) {
      if (id !== diagnosticPath) return null;
      manifest = { mode, selectionTokens, inputObserver, formatCount, rustFormatCount, moduleUrl: `/@fs${diagnosticPath}`, sourceSha256: createHash("sha256").update(code).digest("hex"),
        wasmSha256: createHash("sha256").update(readFileSync(diagnosticPath.replace(/\.js$/, "_bg.wasm"))).digest("hex") };
      if (mode === "off" && formatCount === "off") return null;
      let output = mode === "off" ? code : instrumentWasmEquality(code, recorderPath, mode).code;
      if (formatCount === "inline") output = instrumentWasmFormatCount(output);
      return { code: output, map: null };
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" || request.url !== "/selection-input-diagnostic-map.json") return next();
        response.writeHead(manifest ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(JSON.stringify(manifest ?? { error: "module not loaded" }));
      });
    } }],
  resolve: { alias: [{ find: /^@breditor\/wasm$/, replacement: diagnosticPath }] } });
