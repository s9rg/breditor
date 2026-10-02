import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Old controls are frozen evidence, not aliases for the integrated runtime.
 * Fail during config resolution, before Vite can empty a preserved output dir.
 * Preview stays available for already-built original/candidate artifacts.
 */
export function legacyBoundaryBuildGuard(): Plugin {
  return {
    name: "breditor-preserve-legacy-boundary-control",
    config(_, environment) {
      if (environment.command !== "build") return;
      const sources = ["wasm_profile_descriptor", "wasm_selection_adapter"].map(name =>
        readFileSync(new URL(`../../../packages/breditor-browser/src/${name}.ts`, import.meta.url), "utf8"));
      if (sources.some(source => source.includes("normalizeWasmBoundaryNumber"))) {
        throw new Error("Legacy boundary build retired after runtime integration. Use BREDITOR_BOUNDARY_VARIANT=runtime or vite.selection-stress.config.ts; preview preserved controls without rebuilding.");
      }
    },
  };
}
