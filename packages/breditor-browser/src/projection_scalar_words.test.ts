import { describe, expect, it, vi } from "vitest";
import { decodeProjectionScalarWords as decode } from "./projection_scalar_words.js";
import { decodeProjectionIntegerWords as decodeInteger } from "./projection_scalar_words.js";

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

describe("owned signed integer property words", () => {
  const encode = (value: bigint) => {
    const bits = BigInt.asUintN(64, value);
    return new Uint32Array([1, Number(bits & 0xffffffffn), Number(bits >> 32n)]);
  };
  it("preserves absence, zero, RGB24, negatives and both safe boundaries", () => {
    expect(decodeInteger(new Uint32Array([0, 0, 0]))).toBeUndefined();
    for (const value of [-9007199254740991n, -4294967296n, -5n, 0n, 1193046n,
      4294967295n, 4294967296n, 9007199254740991n]) {
      expect(decodeInteger(encode(value))).toBe(Number(value));
    }
  });
  it("rejects overflow, noncanonical absence, malformed brands and storage", () => {
    for (const value of [encode(9007199254740992n), encode(-9007199254740992n),
      encode(9223372036854775807n), encode(-9223372036854775808n),
      new Uint32Array([0, 1, 0]), new Uint32Array([0, 0, 1]), new Uint32Array([2, 0, 0]),
      new Uint32Array([1, 1]), new Int32Array([1, 0, 0]), [1, 0, 0],
      new Proxy(new Uint32Array([1, 0, 0]), {}), new Uint32Array(new SharedArrayBuffer(12))]) {
      expect(() => decodeInteger(value)).toThrow(TypeError);
    }
    const detached = encode(1n);
    structuredClone(detached.buffer, {transfer: [detached.buffer]});
    expect(() => decodeInteger(detached)).toThrow(TypeError);
  });
  it("admits native cross-realm arrays without invoking foreign tag getters", () => {
    const frame = document.createElement("iframe"); document.body.append(frame);
    try {
      const realm = frame.contentWindow as Window & typeof globalThis;
      expect(decodeInteger(new realm.Uint32Array([1, 0xffffffff, 0xffffffff]))).toBe(-1);
    } finally { frame.remove(); }
    let touched = false;
    expect(() => decodeInteger({get [Symbol.toStringTag](){touched=true;return "Uint32Array";}})).toThrow(TypeError);
    expect(touched).toBe(false);
  });
  it("does not let a foreign getter replace integer conversion intrinsics", () => {
    const record = encode(1193046n);
    let result: number | undefined;
    const asIntN = vi.spyOn(BigInt, "asIntN").mockReturnValue(0n);
    try {
      vi.stubGlobal("BigInt", () => 0n);
      vi.stubGlobal("Number", () => 0);
      result = decodeInteger(record);
    } finally {
      vi.unstubAllGlobals();
      asIntN.mockRestore();
    }
    expect(result).toBe(1193046);
  });
});
