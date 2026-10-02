import { expect, it } from "vitest";
import { createConstantI32BoundWasm } from "./constant_bound_i32_wasm";

it("the i32 control returns the same exact numeric value with a different Wasm type", () => {
  const bound = createConstantI32BoundWasm();
  for (const owner of [0, 1, 0xffff_ffff]) expect(Object.is(bound(owner, 2, 0), 2048)).toBe(true);
});
