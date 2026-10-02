type Bound = (owner: number, format: number, property: number) => number;

/** Ordinary JS call control, preserving the fixture's three-argument call site. */
export function createJavaScriptBound(): Bound {
  return function bound() { return 2048; };
}

/** No Wasm: obtain a primitive double through the browser's DataView built-in. */
export function createDataViewBound(): Bound {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, 2048, true);
  return function bound() { return view.getFloat64(0, true); };
}

/** WABT 1.0.39 output for memory_bound.wat; audited independently of this literal. */
export function createMemoryBoundWasm(): Bound {
  const bytes = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0,
    1, 8, 1, 96, 3, 127, 127, 127, 1, 124,
    3, 2, 1, 0,
    5, 3, 1, 0, 1,
    7, 9, 1, 5, 98, 111, 117, 110, 100, 0, 0,
    10, 9, 1, 7, 0, 65, 0, 43, 3, 0, 11,
    11, 14, 1, 0, 65, 0, 11, 8, 0, 0, 0, 0, 0, 0, 160, 64,
  ]);
  const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes));
  const bound = instance.exports["bound"];
  if (typeof bound !== "function") throw new Error("Memory-bound Wasm export missing");
  return bound as Bound;
}
