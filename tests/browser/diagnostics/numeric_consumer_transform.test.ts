import { expect, it, vi } from "vitest";
import { transformNumericConsumer } from "./numeric_consumer_transform";
import { normalizeBoundaryNumber } from "./normalize_boundary_number";

it("normalizes a selection getter once, retaining its original receiver", () => {
  const code = 'function readSemanticSelection(view) { return ["offset"].map(field => Reflect.get(view, field)); }';
  const output = transformNumericConsumer(code, "/packages/breditor-browser/dist/wasm_selection_adapter.js", "./helper")!;
  const read = new Function("__breditorNormalizeNumber", output.code.slice(output.code.indexOf("\n") + 1) + ";return readSemanticSelection;")(normalizeBoundaryNumber) as (view: object) => unknown;
  const getter = vi.fn(function(this: unknown) { expect(this).toBe(view); return 2048; });
  const view = Object.create(null, { offset: { get: getter } }) as object;
  expect(read(view)).toEqual([2048]);
  expect(getter).toHaveBeenCalledOnce();
  expect(output.sites).toEqual([{ scope: "readSemanticSelection", line: 1 }]);
});
it("wraps only three descriptor results, retaining original rejection checks", () => {
  const code = ["readScalar", "invoke", "invoke2"].map(name => `function ${name}(result) { if (result === null) throw new Error("bad"); return result; }`).join("\n");
  const output = transformNumericConsumer(code, "/packages/breditor-browser/dist/wasm_profile_descriptor.js", "./helper")!;
  expect(output.sites).toHaveLength(3);
  expect(output.code.match(/return __breditorNormalizeNumber\(result\)/gu)).toHaveLength(3);
  expect(output.code.match(/throw new Error\("bad"\)/gu)).toHaveLength(3);
});
it("fails closed on drift and does not touch production source or unrelated modules", () => {
  expect(transformNumericConsumer("anything", "/src/wasm_selection_adapter.ts", "./helper")).toBeNull();
  expect(() => transformNumericConsumer("function renamed() {}", "/breditor-browser/dist/wasm_profile_descriptor.js", "./helper")).toThrow("drift");
  expect(() => transformNumericConsumer("__breditorNormalizeNumber", "/breditor-browser/dist/wasm_selection_adapter.js", "./helper")).toThrow("already installed");
});
