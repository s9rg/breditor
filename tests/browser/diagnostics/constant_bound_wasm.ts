/**
 * A 48-byte hand-written module, with no Rust, wasm-bindgen, memory or imports:
 * (module (func (export "bound") (param i32 i32 i32) (result f64) f64.const 2048))
 * The three ignored parameters match the descriptor method's Wasm call shape.
 */
export function createConstantBoundWasm(): (owner: number, format: number, property: number) => number {
  const bytes = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0,
    1, 8, 1, 96, 3, 127, 127, 127, 1, 124,
    3, 2, 1, 0,
    7, 9, 1, 5, 98, 111, 117, 110, 100, 0, 0,
    10, 13, 1, 11, 0, 68, 0, 0, 0, 0, 0, 0, 160, 64, 11,
  ]);
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  const bound = instance.exports["bound"];
  if (typeof bound !== "function") throw new Error("Tiny Wasm bound export missing");
  return bound as (owner: number, format: number, property: number) => number;
}
