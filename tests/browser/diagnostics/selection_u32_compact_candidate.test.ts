import { expect, it } from "vitest";
import { parseSync } from "rolldown/utils";
import { replaceSelectionU32WithCompact, selectionU32CompactCandidate } from "./selection_u32_compact_candidate";
import { selectionU32Original } from "./selection_u32_production_transform";

const compact = new Function(`${selectionU32CompactCandidate}; return isU32;`)() as (value: unknown) => boolean;
const original = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 0xffffffff;

it("matches u32 admission at zeros, exponent edges, and rejected types", () => {
  let calls = 0;
  const foreign = { [Symbol.toPrimitive]() { calls++; throw new Error("must not coerce"); } };
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const value of [0, -0, 6, 0xffffffff, 0xffffffff + 0.5, 0x100000000,
    -1, 0.5, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER,
    undefined, null, false, true, "6", 6n, Symbol(), new Number(6), foreign, revoked.proxy]) {
    expect(compact(value), String(typeof value)).toBe(original(value));
  }
  expect(calls).toBe(0);
  for (let exponent = -10; exponent <= 54; exponent++) {
    for (const offset of [-1, -0.5, 0, 0.5, 1]) {
      for (const sign of [-1, 1]) {
        const value = sign * (2 ** exponent + offset);
        expect(compact(value), String(value)).toBe(original(value));
      }
    }
  }
});

it("matches one million deterministic IEEE-754 patterns and 100,000 sampled u32 boundaries", () => {
  const view = new DataView(new ArrayBuffer(8));
  let state = 0x6d2b79f5;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  for (let index = 0; index < 1_000_000; index++) {
    view.setUint32(0, next()); view.setUint32(4, next());
    const value = view.getFloat64(0);
    if (compact(value) !== original(value)) throw new Error(`Compact guard disagrees at pattern ${index}`);
  }
  for (let index = 0; index < 100_000; index++) {
    const value = next();
    if (!compact(value) || compact(value + 0.5) || compact(value - 0.5)) {
      throw new Error(`Compact guard disagrees near u32 ${value}`);
    }
  }
});

it("changes only the historical selection predicate and fails closed on source drift", () => {
  const code = `const unrelated = true;\n${selectionU32Original}\n`;
  const output = replaceSelectionU32WithCompact(code);
  expect(parseSync("compact.js", output).errors).toEqual([]);
  expect(output.replace(selectionU32CompactCandidate, `function isU32(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;
}`)).toBe(code);
  expect(() => replaceSelectionU32WithCompact(code + code)).toThrow("source differs");
  expect(() => replaceSelectionU32WithCompact(output)).toThrow("source differs");
});
