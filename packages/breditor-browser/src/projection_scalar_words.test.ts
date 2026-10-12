import { describe, expect, it } from "vitest";
import { decodeProjectionScalarWords as decode } from "./projection_scalar_words.js";

describe("owned projection scalar word records", () => {
  it("distinguishes absent, zero and full-width unsigned values", () => {
    expect(decode(new Uint32Array([0, 0]))).toBeUndefined();
    for (const value of [0, 1, 0xffffffff]) {
      expect(decode(new Uint32Array([1, value]))).toBe(value);
    }
  });

  it("rejects malformed shapes, flags, brands and proxies", () => {
    for (const value of [null, {}, [1, 1], new Int32Array([1, 1]),
      new Uint32Array([]), new Uint32Array([1]), new Uint32Array([1, 1, 1]),
      new Uint32Array([0, 1]), new Uint32Array([2, 1]),
      new Proxy(new Uint32Array([1, 1]), {})]) {
      expect(() => decode(value)).toThrow(TypeError);
    }
  });

  it("uses native brands across realms without invoking spoofed tags", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    try {
      const realm = frame.contentWindow as Window & typeof globalThis;
      expect(decode(new realm.Uint32Array([1, 0xffffffff]))).toBe(0xffffffff);
      expect(() => decode(new realm.Int32Array([1, 1]))).toThrow(TypeError);
    } finally { frame.remove(); }
    let touched = false;
    expect(() => decode({ get [Symbol.toStringTag]() { touched = true; return "Uint32Array"; } }))
      .toThrow(TypeError);
    expect(touched).toBe(false);
  });

  it("rejects shared and detached backing storage", () => {
    expect(() => decode(new Uint32Array(new SharedArrayBuffer(8)))).toThrow(TypeError);
    const record = new Uint32Array([1, 1]);
    structuredClone(record.buffer, { transfer: [record.buffer] });
    expect(() => decode(record)).toThrow(TypeError);
  });
});
