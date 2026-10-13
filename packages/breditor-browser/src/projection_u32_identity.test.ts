import {describe, expect, it, vi} from "vitest";
import {projectionU32sEqual} from "./projection_u32_identity.js";

describe("exact projection u32 identity", () => {
  it("retains equal/different identities across integer representations and u32 boundaries", () => {
    const values = [0, -0, 1, 15, 55, 81, 453, 501, 634, 809, 1587, 2048,
      2 ** 31 - 1, 2 ** 31, 2 ** 32 - 1];
    const doubles = new Float64Array(values);
    const words = new Uint32Array(values);
    for (const left of values) for (const right of values) {
      expect(projectionU32sEqual(left, right)).toBe(left === right);
    }
    for (let index = 0; index < values.length; index += 1) {
      expect(projectionU32sEqual(values[index], doubles[index])).toBe(true);
      expect(projectionU32sEqual(words[index], doubles[index])).toBe(true);
      expect(projectionU32sEqual(Number(String(values[index])), doubles[index])).toBe(true);
    }
  });

  it("rejects invalid operands independently, including pairs of the same invalid value", () => {
    const invalid: unknown[] = [undefined, null, true, false, "0", "1", 1n, Symbol("index"),
      NaN, Infinity, -Infinity, -1, -4294967295, 0.5, 1.0000000000000002,
      2 ** 32, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Number.MIN_VALUE,
      {}, [], new Number(1), () => 1];
    for (const value of invalid) {
      expect(projectionU32sEqual(value, 1)).toBe(false);
      expect(projectionU32sEqual(1, value)).toBe(false);
      expect(projectionU32sEqual(value, value)).toBe(false);
    }
  });

  it("does not invoke foreign conversion hooks or proxy traps", () => {
    let calls = 0;
    const foreign = new Proxy({
      toString() { calls += 1; throw Error("must not coerce"); },
      valueOf() { calls += 1; throw Error("must not coerce"); },
    }, {get() { calls += 1; throw Error("must not inspect"); }});
    expect(projectionU32sEqual(foreign, 1)).toBe(false);
    expect(projectionU32sEqual(1, foreign)).toBe(false);
    expect(calls).toBe(0);
  });

  it("does not round, truncate or accept a different admitted coordinate", () => {
    for (const value of [0, 1, 55, 501, 1587, 4294967294]) {
      expect(projectionU32sEqual(value, value + 1)).toBe(false);
      expect(projectionU32sEqual(value + 0.5, value)).toBe(false);
    }
  });

  it("retains its primitive converter if host code later replaces global String", () => {
    let foreignCalls = 0;
    const replacement = vi.spyOn(globalThis, "String").mockImplementation(() => {
      foreignCalls += 1;
      return "1";
    });
    let equal: boolean, different: boolean, observedCalls: number;
    try {
      equal = projectionU32sEqual(55, 55);
      different = projectionU32sEqual(55, 56);
      observedCalls = foreignCalls;
    } finally {
      replacement.mockRestore();
    }
    expect(equal).toBe(true);
    expect(different).toBe(false);
    expect(observedCalls).toBe(0);
  });
});
