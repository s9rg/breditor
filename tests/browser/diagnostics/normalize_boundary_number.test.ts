import { expect, it, vi } from "vitest";
import { normalizeBoundaryNumber } from "./normalize_boundary_number";

it("preserves all tested numeric values including malformed metadata and signed zero", () => {
  for (const value of [0, -0, 1, -1, 2048, 1.5, NaN, Infinity, -Infinity,
    Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, Number.EPSILON,
    2048 + 2 ** -41, 0xffff_ffff, 0x1_0000_0000,
    Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 2 ** 53]) {
    expect(Object.is(normalizeBoundaryNumber(value), value)).toBe(true);
  }
});
it("does not coerce any foreign object, string, bigint or absent value", () => {
  const coerce = vi.fn(() => 2048);
  const object = { [Symbol.toPrimitive]: coerce };
  for (const value of [object, new Number(2048), undefined, null, "2048", true, 2048n, Symbol("foreign")]) {
    expect(normalizeBoundaryNumber(value)).toBe(value);
  }
  expect(coerce).not.toHaveBeenCalled();
});

it("round-trips a deterministic sample of IEEE-754 bit patterns without changing numeric semantics", () => {
  const bits = new DataView(new ArrayBuffer(8));
  let state = 0x9e3779b9;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  for (let i = 0; i < 10_000; i++) {
    bits.setUint32(0, next(), false);
    bits.setUint32(4, next(), false);
    const value = bits.getFloat64(0, false);
    expect(Object.is(normalizeBoundaryNumber(value), value)).toBe(true);
  }
});
