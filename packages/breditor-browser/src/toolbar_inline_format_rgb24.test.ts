import { describe, expect, it } from "vitest";

import {
  decodeToolbarInlineFormatRgb24Color,
  encodeToolbarInlineFormatRgb24Color,
  isToolbarInlineFormatRgb24Integer,
} from "./toolbar_inline_format_rgb24.js";

describe("toolbar RGB24 presentation", () => {
  it("encodes exact integers as lowercase zero-padded HTML simple colors", () => {
    expect(encodeToolbarInlineFormatRgb24Color(0)).toBe("#000000");
    expect(encodeToolbarInlineFormatRgb24Color(0x00000a)).toBe("#00000a");
    expect(encodeToolbarInlineFormatRgb24Color(0x12abef)).toBe("#12abef");
    expect(encodeToolbarInlineFormatRgb24Color(0xffffff)).toBe("#ffffff");
  });

  it("decodes only exact lowercase #rrggbb values", () => {
    expect(decodeToolbarInlineFormatRgb24Color("#000000")).toBe(0);
    expect(decodeToolbarInlineFormatRgb24Color("#00000a")).toBe(10);
    expect(decodeToolbarInlineFormatRgb24Color("#12abef")).toBe(0x12abef);
    expect(decodeToolbarInlineFormatRgb24Color("#ffffff")).toBe(0xffffff);

    for (const value of [
      "#ABCDEF",
      "abcdef",
      "#abc",
      "#abcdef00",
      "#abcdeg",
      " #abcdef",
      "#abcdef ",
      0xabcdef,
      null,
    ]) {
      expect(decodeToolbarInlineFormatRgb24Color(value)).toBeNull();
    }
  });

  it("rejects values that cannot round-trip canonically through JSON", () => {
    for (const value of [-0, -1, 0x1000000, 1.5, NaN, Infinity, "0"]) {
      expect(isToolbarInlineFormatRgb24Integer(value)).toBe(false);
      expect(encodeToolbarInlineFormatRgb24Color(value)).toBeNull();
    }
  });
});
