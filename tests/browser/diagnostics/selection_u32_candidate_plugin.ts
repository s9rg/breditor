import { createHash } from "node:crypto";
import type { Plugin } from "vite";
import { transformSelectionU32Production, type SelectionU32Mode } from "./selection_u32_production_transform";

export function selectionU32Mode(value = process.env["BREDITOR_SELECTION_U32"] ?? "compact"): SelectionU32Mode {
  if (value !== "original" && value !== "bits" && value !== "compact") throw new Error("BREDITOR_SELECTION_U32 must be original, bits, or compact");
  return value;
}

/** Exact guard substitution only: no browser recorders, wrappers or logging.
 * Server/build metadata records which bytes were used, outside the workload.
 */
export function selectionU32CandidatePlugin(mode: SelectionU32Mode): Plugin {
  let module: { originalSha256: string; executedSha256: string } | null = null;
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const manifest = () => JSON.stringify({ mode, logging: false, module });
  return {
    name: "breditor-selection-u32-logger-free", enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/breditor-browser/dist/wasm_selection_adapter.js")) return null;
      const executed = transformSelectionU32Production(code, mode);
      module = { originalSha256: hash(code), executedSha256: hash(executed) };
      return mode === "compact" ? null : { code: executed, map: null };
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
