/** Rust-free i32 counterpart of the f64 constant-bound module (42 bytes). */
export function createConstantI32BoundWasm(): (owner: number, format: number, property: number) => number {
  // (module (func (export "bound") (param i32 i32 i32) (result i32) i32.const 2048))
  const bytes = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0,
    1, 8, 1, 96, 3, 127, 127, 127, 1, 127,
    3, 2, 1, 0,
    7, 9, 1, 5, 98, 111, 117, 110, 100, 0, 0,
    10, 7, 1, 5, 0, 65, 128, 16, 11,
  ]);
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  const bound = instance.exports["bound"];
  if (typeof bound !== "function") throw new Error("Tiny i32 bound export missing");
  return bound as (owner: number, format: number, property: number) => number;
}
