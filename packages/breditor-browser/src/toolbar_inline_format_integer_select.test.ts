import { describe, expect, it } from "vitest";

import {
  MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_LABEL_UTF16,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_OPTIONS,
  decodeToolbarInlineFormatIntegerSelectValue,
  encodeToolbarInlineFormatIntegerSelectValue,
  isToolbarInlineFormatIntegerSelectValue,
  snapshotToolbarInlineFormatIntegerSelect,
} from "./toolbar_inline_format_integer_select.js";

describe("toolbar inline-format integer select", () => {
  it("copies and freezes one exhaustive contiguous option domain", () => {
    const source = [
      { value: -1, label: "Small", callback: () => undefined },
      { value: 0, label: "Large" },
      { value: 1, label: "Huge" },
    ];
    const snapshot = snapshotToolbarInlineFormatIntegerSelect(-1, 1, 0, source);
    source[1]!.label = "Changed";

    expect(snapshot).toEqual({
      minimum: -1,
      maximum: 1,
      defaultValue: 0,
      options: [
        { value: -1, label: "Small" },
        { value: 0, label: "Large" },
        { value: 1, label: "Huge" },
      ],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.options)).toBe(true);
    expect(snapshot.options.every(Object.isFrozen)).toBe(true);
    expect("callback" in snapshot.options[0]!).toBe(false);
  });

  it("requires exact safe bounds, defaults, and exhaustive options", () => {
    const valid = [
      { value: 0, label: "Small" },
      { value: 1, label: "Large" },
      { value: 2, label: "Huge" },
    ];
    for (const [minimum, maximum, defaultValue, options] of [
      [-0, 2, 1, valid],
      [0, -0, 0, [{ value: 0, label: "Only" }]],
      [0, 2, -0, valid],
      [0, 2, 3, valid],
      [0, 2, 1.5, valid],
      [0, 2, 1, valid.slice(0, 2)],
      [0, 1, 0, valid],
      [0, 2, 1, [valid[0], valid[2], valid[1]]],
      [0, 2, 1, [valid[0], valid[0], valid[2]]],
      [0, 2, 1, [valid[0], { value: 2, label: "Huge" }]],
    ] as const) {
      expect(() =>
        snapshotToolbarInlineFormatIntegerSelect(
          minimum,
          maximum,
          defaultValue,
          options,
        ),
      ).toThrow();
    }

    expect(() => snapshotToolbarInlineFormatIntegerSelect(0, 0, 0, [])).toThrow(
      RangeError,
    );
    expect(() =>
      snapshotToolbarInlineFormatIntegerSelect(
        0,
        MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_OPTIONS,
        0,
        Array.from(
          { length: MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_OPTIONS + 1 },
          (_, value) => ({ value, label: `Option ${value}` }),
        ),
      ),
    ).toThrow(RangeError);
  });

  it("requires bounded non-control option labels", () => {
    for (const label of [
      "",
      "   ",
      "bad\nlabel",
      "x".repeat(MAX_TOOLBAR_INLINE_FORMAT_FORM_INTEGER_SELECT_LABEL_UTF16 + 1),
    ]) {
      expect(() =>
        snapshotToolbarInlineFormatIntegerSelect(0, 0, 0, [
          { value: 0, label },
        ]),
      ).toThrow(TypeError);
    }
  });

  it("rejects sparse and accessor-backed options without invoking getters", () => {
    const sparse = new Array(1);
    expect(() =>
      snapshotToolbarInlineFormatIntegerSelect(0, 0, 0, sparse),
    ).toThrow(/own data property/u);

    let reads = 0;
    const accessorOption = { value: 0 };
    Object.defineProperty(accessorOption, "label", {
      get: () => {
        reads += 1;
        return "Private";
      },
    });
    expect(() =>
      snapshotToolbarInlineFormatIntegerSelect(0, 0, 0, [accessorOption]),
    ).toThrow(/own data property/u);

    const accessorArray = [{ value: 0, label: "Zero" }];
    Object.defineProperty(accessorArray, "0", {
      configurable: true,
      get: () => {
        reads += 1;
        return { value: 0, label: "Private" };
      },
    });
    expect(() =>
      snapshotToolbarInlineFormatIntegerSelect(0, 0, 0, accessorArray),
    ).toThrow(/own data property/u);
    expect(reads).toBe(0);
  });

  it("uses descriptor reads only and redacts hostile proxy failures", () => {
    let ordinaryReads = 0;
    const noOrdinaryReads = new Proxy([{ value: 0, label: "Zero" }], {
      get: () => {
        ordinaryReads += 1;
        throw new Error("ordinary reads are forbidden");
      },
    });
    expect(
      snapshotToolbarInlineFormatIntegerSelect(0, 0, 0, noOrdinaryReads)
        .options,
    ).toEqual([{ value: 0, label: "Zero" }]);
    expect(ordinaryReads).toBe(0);

    const privateText = "private-proxy-message";
    const hostile = new Proxy([{ value: 0, label: "Zero" }], {
      getOwnPropertyDescriptor() {
        throw new Error(privateText);
      },
    });
    let failure: unknown;
    try {
      snapshotToolbarInlineFormatIntegerSelect(0, 0, 0, hostile);
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
    expect(String(failure)).not.toContain(privateText);
  });

  it("round-trips only canonical base-ten values inside the domain", () => {
    for (const value of [-2, -1, 0, 1, 2]) {
      const encoded = encodeToolbarInlineFormatIntegerSelectValue(value, -2, 2);
      expect(encoded).toBe(String(value));
      expect(decodeToolbarInlineFormatIntegerSelectValue(encoded, -2, 2)).toBe(
        value,
      );
      expect(isToolbarInlineFormatIntegerSelectValue(value, -2, 2)).toBe(true);
    }
    for (const value of ["", "+1", "01", "-0", "1.0", "1e0", " 1 "]) {
      expect(
        decodeToolbarInlineFormatIntegerSelectValue(value, -2, 2),
      ).toBeNull();
    }
    for (const value of [-3, 3, -0, 1.5, "1", null]) {
      expect(
        encodeToolbarInlineFormatIntegerSelectValue(value, -2, 2),
      ).toBeNull();
    }
  });
});
