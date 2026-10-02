import { describe, expect, it, vi } from "vitest";
import { describeNumericComparison } from "./numeric_comparison_diagnostic";

describe("cold numeric comparison evidence", () => {
  it("records exact IEEE-754 words for equal numeric bounds", () => {
    expect(describeNumericComparison(2048, 2048)).toEqual({
      actual: 2048, expected: 2048, actualType: 1, expectedType: 1,
      objectIsRecheck: 1, strictEqualRecheck: 1,
      actualHigh: 0x40a00000, actualLow: 0, expectedHigh: 0x40a00000, expectedLow: 0,
    });
  });
  it("distinguishes adjacent representable values and signed zero", () => {
    expect(describeNumericComparison(2048 + 2 ** -41, 2048)).toMatchObject({
      objectIsRecheck: 0, strictEqualRecheck: 0, actualHigh: 0x40a00000, actualLow: 1, expectedLow: 0,
    });
    expect(describeNumericComparison(-0, 0)).toMatchObject({
      objectIsRecheck: 0, strictEqualRecheck: 1, actualHigh: 0x80000000, expectedHigh: 0,
    });
  });
  it("does not coerce or expose nonnumeric values", () => {
    const coerce = vi.fn(() => "private");
    expect(describeNumericComparison({ [Symbol.toPrimitive]: coerce }, "private")).toEqual({
      actualType: 2, expectedType: 2, objectIsRecheck: 0, strictEqualRecheck: 0,
    });
    expect(coerce).not.toHaveBeenCalled();
  });
});
