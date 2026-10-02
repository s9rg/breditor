import { expect, it } from "vitest";
import { createConstantBoundWasm } from "./constant_bound_wasm";

it("the Rust-free Wasm control returns exactly the declared f64 bound", () => {
  const bound = createConstantBoundWasm();
  for (const owner of [0, 1, 0xffff_ffff]) {
    expect(Object.is(bound(owner, 2, 0), 2048)).toBe(true);
    expect(Object.is(bound(owner, 2, 1), 2048)).toBe(true);
  }
});
