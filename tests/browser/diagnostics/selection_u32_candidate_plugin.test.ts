import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { selectionU32CandidatePlugin, selectionU32Mode } from "./selection_u32_candidate_plugin";
import { transformSelectionU32Production } from "./selection_u32_production_transform";

const id = "/repo/packages/breditor-browser/dist/wasm_selection_adapter.js";
const source = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url), "utf8");
it.each(["original", "bits", "compact"] as const)("%s transforms no unrelated module and emits matching identity", mode => {
  const plugin = selectionU32CandidatePlugin(mode);
  const transform = plugin.transform as (code: string, id: string) => { code: string } | null;
  for (const name of ["browser_editor", "wasm_command_adapter", "wasm_projection_adapter"]) {
    expect(transform("unchanged", id.replace("wasm_selection_adapter", name))).toBeNull();
  }
  const emitFile = vi.fn();
  const bundle = plugin.generateBundle as () => void;
  expect(() => bundle.call({ emitFile })).toThrow("not transformed");
  expect(transform(source, id)).toEqual(mode === "compact" ? null
    : { code: transformSelectionU32Production(source, mode), map: null });
  bundle.call({ emitFile });
  const manifest = JSON.parse(emitFile.mock.calls[0]![0].source);
  expect(manifest).toMatchObject({ mode, logging: false });
  expect(manifest.module.originalSha256 === manifest.module.executedSha256).toBe(mode === "compact");
  expect(() => transform("drift", id)).toThrow("source differs");
});
it("rejects unknown experiment modes", () => {
  expect(selectionU32Mode("bits")).toBe("bits");
  expect(selectionU32Mode("original")).toBe("original");
  expect(selectionU32Mode("compact")).toBe("compact");
  expect(() => selectionU32Mode("off")).toThrow("must be original, bits, or compact");
});
