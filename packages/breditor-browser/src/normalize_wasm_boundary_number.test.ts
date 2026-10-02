import { expect, it, vi } from "vitest";
import { normalizeWasmBoundaryNumber } from "./normalize_wasm_boundary_number.js";

it("preserves numeric semantics, including signed zero and invalid boundary values", () => {
  for (const value of [0, -0, 1, -1, 2048, 1.5, NaN, Infinity, -Infinity,
    Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, Number.EPSILON,
    2048 + 2 ** -41, 0xffff_ffff, 0x1_0000_0000,
    Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 2 ** 53]) {
    expect(Object.is(normalizeWasmBoundaryNumber(value), value)).toBe(true);
  }
});

it("re-materializes both zero signs without a numeric early return", () => {
  const stringify = vi.spyOn(globalThis, "String");
  try {
    const bits = new DataView(new ArrayBuffer(8));
    for (const sign of [0x00, 0x80, 0x00, 0x80]) {
      bits.setFloat64(0, 0, false);
      bits.setUint8(0, sign);
      const incoming = bits.getFloat64(0, false);
      stringify.mockClear();
      const result = normalizeWasmBoundaryNumber(incoming);
      expect(stringify).toHaveBeenCalledTimes(1);
      expect(stringify).toHaveBeenCalledWith(incoming);
      bits.setFloat64(0, result as number, false);
      expect(bits.getUint8(0)).toBe(sign);
    }
  } finally {
    stringify.mockRestore();
  }
});

it("leaves foreign and absent values untouched without invoking coercion", () => {
  const coerce = vi.fn(() => 2048);
  const object = { [Symbol.toPrimitive]: coerce };
  for (const value of [object, new Number(2048), undefined, null, "2048", true, 2048n, Symbol("foreign")]) {
    expect(normalizeWasmBoundaryNumber(value)).toBe(value);
  }
  expect(coerce).not.toHaveBeenCalled();
});

it("preserves a deterministic 10,000-pattern IEEE-754 sample", () => {
  const bits = new DataView(new ArrayBuffer(8));
  let state = 0x9e3779b9;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return state >>> 0;
  };
  for (let i = 0; i < 10_000; i++) {
    bits.setUint32(0, next(), false); bits.setUint32(4, next(), false);
    const value = bits.getFloat64(0, false);
    expect(Object.is(normalizeWasmBoundaryNumber(value), value)).toBe(true);
  }
});
