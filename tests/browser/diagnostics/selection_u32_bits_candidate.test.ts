import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseSync } from "rolldown/utils";
import { replaceSelectionU32WithBits, selectionU32BitsCandidate } from "./selection_u32_bits_candidate";

const candidate = new Function(`${selectionU32BitsCandidate}; return isU32;`)() as (value: unknown) => boolean;
const original = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;

it("preserves both zeros, fractions, exponent boundaries and the complete u32 upper boundary", () => {
  for (const value of [0, -0, 6, NaN, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE,
    0xffffffff, 0xffffffff + 0.5, 0x100000000, Number.MAX_SAFE_INTEGER]) {
    expect(candidate(value), String(value)).toBe(original(value));
  }
  for (let exponent = -10; exponent <= 54; exponent++) {
    for (const offset of [-1, -0.5, 0, 0.5, 1]) {
      for (const sign of [-1, 1]) {
        const value = sign * (2 ** exponent + offset);
        expect(candidate(value), String(value)).toBe(original(value));
      }
    }
  }
});

it("agrees on 100,000 deterministic IEEE-754 patterns", () => {
  const view = new DataView(new ArrayBuffer(8));
  let state = 0x6d2b79f5;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
  for (let index = 0; index < 100000; index++) {
    view.setUint32(0, next()); view.setUint32(4, next());
    const value = view.getFloat64(0);
    if (candidate(value) !== original(value)) throw new Error(`Candidate disagrees at pattern ${index}`);
  }
});

it("accepts 10,000 distributed u32 values and rejects their fractional neighbors", () => {
  let state = 0xfedcba98;
  for (let index = 0; index < 10000; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    if (!candidate(state) || candidate(state + 0.5) || candidate(state - 0.5)) {
      throw new Error(`Candidate disagrees near u32 ${state}`);
    }
  }
});

it("rejects foreign values without coercion or proxy access", () => {
  let calls = 0;
  const foreign = { [Symbol.toPrimitive]() { calls++; throw new Error("must not coerce"); } };
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const value of [undefined, null, false, true, "6", 6n, Symbol(), new Number(6), foreign, revoked.proxy]) {
    expect(candidate(value)).toBe(false);
  }
  expect(calls).toBe(0);
});

it("changes only the exact production selection predicate and rejects source drift", () => {
  const code = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url), "utf8");
  const output = replaceSelectionU32WithBits(code);
  expect(parseSync("candidate.js", output).errors).toEqual([]);
  expect(output.replace(selectionU32BitsCandidate, `function isU32(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;
}`)).toBe(code);
  expect(() => replaceSelectionU32WithBits(code + code)).toThrow("source differs");
  expect(() => replaceSelectionU32WithBits(output)).toThrow("source differs");
  expect(() => replaceSelectionU32WithBits(code.replace("4_294_967_295", "4294967295"))).toThrow("source differs");
});
