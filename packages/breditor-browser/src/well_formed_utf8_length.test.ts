import { describe, expect, it } from "vitest";
import { wellFormedUtf8Length } from "./well_formed_utf8_length.js";

describe("bounded, well-formed UTF-8 length", () => {
  it.each(["", "ASCII\u0000", "\u0080\u07ff", "\u0800\uffff", "💡", "aé中💡z"])(
    "counts %j exactly and enforces the byte limit",
    (text) => {
      const bytes = new TextEncoder().encode(text).byteLength;
      expect(wellFormedUtf8Length(text, bytes)).toBe(bytes);
      expect(wellFormedUtf8Length(text, bytes + 1)).toBe(bytes);
      if (bytes > 0) expect(wellFormedUtf8Length(text, bytes - 1)).toBeNull();
    },
  );

  it.each(["\ud800", "\udfff", "\ud800a", "\ud800\ud800", "a\udfff", "💡\ud800"])(
    "rejects unpaired surrogates in %j",
    (text) => expect(wellFormedUtf8Length(text, 100)).toBeNull(),
  );
});
