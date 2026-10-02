import { expect, it } from "vitest";
import { capturedComparisonFunction, sameValueExpression, transformJscComparison } from "./jsc_comparison_variants.mjs";

it("rejects unknown variants and changed source before transformation", () => {
  expect(() => transformJscComparison("", "typo")).toThrow("Unknown");
  expect(() => transformJscComparison("", "captured")).toThrow("drift");
});

it("all instrumented comparisons preserve success and report a real mismatch", () => {
  for (const variant of ["captured", "strict", "same-value-js"]) {
    const globals: Record<string, unknown> = {};
    const expected = [["string", undefined, undefined, 1, 2048]];
    const rejected: unknown[][] = [];
    const compare = new Function("o", "s", "globalThis", `${capturedComparisonFunction(variant)}; return c;`)(
      expected, (...args: unknown[]) => { rejected.push(args); }, globals);
    compare([...expected[0]!], 0, 0);
    expect(rejected).toEqual([]);
    expect(globals).toEqual({});
    compare(["string", undefined, undefined, 1, 2047], 12, 0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.slice(2)).toEqual([12, 0, 16]);
    expect(globals["breditorHotComparison"]).toMatchObject({ iteration: 12, field: 4,
      actual: 2047, expected: 2048, equal: false, maskBefore: 0, maskAfter: 16,
      strictEqual: false, objectIsAgain: false });
  }
});

// The transformation is tied to a locally preserved build. Unit tests must
// remain independent of ignored build output: verify formula semantics directly.
it("the explicit SameValue expression preserves NaN and signed zero", () => {
  const sameValue = new Function("actual", "expected", `return ${sameValueExpression}`);
  const object = {};
  const symbol = Symbol("same"), callable = () => {};
  const values = [undefined, null, false, true, "", "2048", 0, -0, NaN, Infinity, -Infinity, 2048, 0.5,
    0n, 2048n, symbol, Symbol("same"), callable, object, {}];
  for (const actual of values) for (const expected of values) expect(sameValue(actual, expected)).toBe(Object.is(actual, expected));
});

it("labels the minimal capture as the last field, not necessarily the mismatching field", () => {
  const globals: Record<string, unknown> = {};
  const compare = new Function("o", "s", "globalThis", `${capturedComparisonFunction("result-only")}; return c;`)(
    [[1, 2048]], () => {}, globals);
  compare([1, 2047], 0, 0);
  expect(globals["breditorHotComparison"]).toEqual({ lastComparisonResult: false, lastField: 1, maskAfter: 2 });
  compare([2, 2048], 0, 0);
  expect(globals["breditorHotComparison"]).toEqual({ lastComparisonResult: true, lastField: 1, maskAfter: 1 });
});
