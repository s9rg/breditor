import { createHash } from "node:crypto";
import type { Plugin } from "vite";
import { replaceSelectionU32WithBits } from "./selection_u32_bits_candidate";

export function selectionU32Mode(value = process.env["BREDITOR_SELECTION_U32"] ?? "bits"): "original" | "bits" {
  if (value !== "original" && value !== "bits") throw new Error("BREDITOR_SELECTION_U32 must be original or bits");
  return value;
}

/** Exact guard substitution only: no browser recorders, wrappers or logging.
 * Server/build metadata records which bytes were used, outside the workload.
 */
export function selectionU32CandidatePlugin(mode: "original" | "bits"): Plugin {
  let module: { originalSha256: string; executedSha256: string } | null = null;
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const manifest = () => JSON.stringify({ mode, logging: false, module });
  return {
    name: "breditor-selection-u32-logger-free", enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/breditor-browser/dist/wasm_selection_adapter.js")) return null;
      const candidate = replaceSelectionU32WithBits(code); // Check source drift in both arms.
      const executed = mode === "bits" ? candidate : code;
      module = { originalSha256: hash(code), executedSha256: hash(executed) };
      return mode === "bits" ? { code: executed, map: null } : null;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" || request.url !== "/selection-u32-manifest.json") return next();
        response.writeHead(module ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(manifest());
      });
    },
    generateBundle() {
      if (!module) throw new Error("Selection candidate module was not transformed");
      this.emitFile({ type: "asset", fileName: "selection-u32-manifest.json", source: manifest() });
    },
  };
}
