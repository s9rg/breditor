import { describe, expect, it, vi } from "vitest";
import { instrumentStartupModule } from "./startup_instrumentation";

const id = "/checkout/packages/breditor-browser/dist/wasm_session_checkpoint.js";

describe("startup rejection instrumentation", () => {
  it("captures descriptor guards, exceptions, cleanup and final admission, but not provisional defaults", () => {
    const source = `function consumeDescriptor(flag, read, release) {
  if (flag === 1) return descriptorFailure();
  let result = descriptorFailure();
  try { result = read(); } catch { result = descriptorFailure(); }
  finally { if (!release()) result = descriptorFailure(); }
  return result.ok && flag === 4 ? descriptorFailure() : result;
}`;
    const output = instrumentStartupModule(source, id.replace("wasm_session_checkpoint", "wasm_profile_descriptor"), "./recorder")!;
    const record = vi.fn();
    const failure = vi.fn(() => ({ ok: false }));
    const run = new Function("__breditorStartupRejection", "descriptorFailure",
      output.code.slice(output.code.indexOf("\n") + 1) + ";return consumeDescriptor;")(record, failure);
    expect(output.sites.map(site => site.line)).toEqual([2, 4, 5, 6]);
    expect(run(0, () => ({ ok: true }), () => true)).toEqual({ ok: true });
    expect(record).not.toHaveBeenCalled();
    for (const flag of [1, 2, 3, 4]) {
      record.mockClear();
      expect(run(flag, () => { if (flag === 2) throw new Error("private"); return { ok: true }; }, () => flag !== 3)).toEqual({ ok: false });
      expect(record).toHaveBeenCalledExactlyOnceWith(`descriptor:consumeDescriptor:${[2, 4, 5, 6][flag - 1]}`);
    }
  });
  it("ignores public package source and unrelated modules", () => {
    expect(instrumentStartupModule("anything", "/src/wasm_session_checkpoint.ts", "./recorder")).toBeNull();
    expect(instrumentStartupModule("anything", "/dist/other.js", "./recorder")).toBeNull();
  });

  it("runs only the original rejection branch, with one original predicate evaluation", () => {
    const code = `function validateCheckpointEnvelope(check) {
  if (!check()) return null;
  return 7;
}`;
    const output = instrumentStartupModule(code, id, "./recorder")!;
    const record = vi.fn();
    // Execute only this local synthetic test fixture, never application payloads.
    const run = new Function("__breditorStartupRejection", output.code.slice(output.code.indexOf("\n") + 1) + ";return validateCheckpointEnvelope;")(record) as (check: () => boolean) => number | null;
    const valid = vi.fn(() => true);
    const invalid = vi.fn(() => false);
    expect(run(valid)).toBe(7);
    expect(record).not.toHaveBeenCalled();
    expect(run(invalid)).toBeNull();
    expect(valid).toHaveBeenCalledOnce();
    expect(invalid).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledExactlyOnceWith("checkpoint:validateCheckpointEnvelope:2");
    expect(output.sites[0]).toMatchObject({ function: "validateCheckpointEnvelope", line: 2 });
    expect(output.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("does not instrument expected alternative-shape misses or nested callbacks", () => {
    const code = `function exactRecord() { return null; }
function validateCheckpointEnvelope(check) {
  const callback = () => { return null; };
  if (!check()) return null;
  return callback;
}`;
    const output = instrumentStartupModule(code, id, "./recorder")!;
    expect(output.sites).toHaveLength(1);
    expect(output.code).toContain("function exactRecord() { return null; }");
    expect(output.code).toContain("() => { return null; }");
  });

  it("records byte counters only, without code points or string contents", () => {
    const output = instrumentStartupModule(
      "function wellFormedUtf8Length(value, maximum) { let bytes=0; for(let index=0;index<value.length;index++) { bytes++; if(bytes>maximum)return null; } return bytes; }",
      id, "./recorder")!;
    expect(output.code).toContain("{ index, bytes, maximum, length: value.length }");
    expect(output.code).not.toContain("first:");
  });

  it("fails closed on emitted-source drift and duplicate instrumentation", () => {
    expect(() => instrumentStartupModule("function renamed() { return null; }", id, "./recorder")).toThrow("No named rejection sites");
    expect(() => instrumentStartupModule("__breditorStartupRejection", id, "./recorder")).toThrow("already installed");
    expect(() => instrumentStartupModule("function readSource(){return null;}", id.replace("wasm_session_checkpoint", "wasm_engine_bootstrap"), "./recorder")).toThrow("expected 2 sites");
    expect(() => instrumentStartupModule("function {", id, "./recorder")).toThrow("Cannot parse");
  });

  it("captures both request exits and the profile result without changing error codes", () => {
    const code = `function bootstrap(flag) {
  if (flag) return failure(INVALID_REQUEST);
  return failure(INVALID_REQUEST);
}
function consumeCompiledProfile() { return { ok: false, error: INVALID_REQUEST }; }`;
    const output = instrumentStartupModule(code, id.replace("wasm_session_checkpoint", "wasm_engine_bootstrap"), "./recorder")!;
    expect(output.sites).toHaveLength(3);
    expect(output.code.match(/failure\(INVALID_REQUEST\)/gu)).toHaveLength(2);
    expect(output.code).toContain("{ ok: false, error: INVALID_REQUEST }");
  });

  it("keeps Unicode source offsets intact", () => {
    const code = '// 🙂\nfunction validateCheckpointEnvelope() { const text="🙂"; return null; }';
    const output = instrumentStartupModule(code, id, "./recorder")!;
    expect(output.code).toContain('const text="🙂"; return (__breditorStartupRejection("checkpoint:validateCheckpointEnvelope:2"), null);');
    expect(output.sites[0]?.column).toBe(code.split("\n")[1]!.indexOf("null") + 1);
  });

  it("records rejected boolean property bounds without capturing accepted nullable bounds", () => {
    const code = `function readFormatPropertyValueType(kind, integerMinimum, integerMaximum, stringMinimum, stringMaximum) {
  if (kind === "boolean") return integerMinimum === undefined ? {kind} : null;
  return {kind, minimum: integerMinimum ?? null};
}`;
    const output = instrumentStartupModule(code, id.replace("wasm_session_checkpoint", "wasm_profile_descriptor"), "./recorder")!;
    const record = vi.fn();
    const run = new Function("__breditorStartupRejection", output.code.slice(output.code.indexOf("\n") + 1) + ";return readFormatPropertyValueType;")(record) as (...args: unknown[]) => unknown;
    expect(run("boolean", undefined)).toEqual({ kind: "boolean" });
    expect(run("integer", undefined)).toEqual({ kind: "integer", minimum: null });
    expect(record).not.toHaveBeenCalled();
    expect(run("boolean", 0)).toBeNull();
    expect(record).toHaveBeenCalledExactlyOnceWith("descriptor:readFormatPropertyValueType:2", {
      kindTag: 1, integerMinimum: 0, integerMinimumType: 1,
      integerMaximum: undefined, integerMaximumType: 0,
      stringMinimum: undefined, stringMinimumType: 0,
      stringMaximum: undefined, stringMaximumType: 0,
    });
    expect(output.sites).toHaveLength(1);
  });

  it("captures selection lookup fallthrough without logging successful paths", () => {
    const code = `function pathAtPreorderIndex(projection, requestedIndex, expectedKind) {
  let nodeIndex = 2;
  if (requestedIndex === nodeIndex) return expectedKind === "text" ? [0, 0] : null;
  nodeIndex++;
  return null;
}`;
    const output = instrumentStartupModule(code, id.replace("wasm_session_checkpoint", "wasm_selection_adapter"), "./recorder")!;
    const record = vi.fn();
    const run = new Function("__breditorStartupRejection", output.code.slice(output.code.indexOf("\n") + 1) + ";return pathAtPreorderIndex;")(record) as (...args: unknown[]) => unknown;
    expect(run({}, 2, "text")).toEqual([0, 0]);
    expect(record).not.toHaveBeenCalled();
    expect(run({}, 8, "text")).toBeNull();
    expect(record).toHaveBeenCalledExactlyOnceWith("selection:pathAtPreorderIndex:5", {
      requestedIndex: 8, nodeIndex: 3, expectedKindTag: 1,
    });
    expect(output.sites).toHaveLength(2);
  });

  it("labels cold contract rechecks separately and never records contract names", () => {
    const code = `function isQualifiedName(value) { return typeof value === "string"; }
function isPositiveU32(value) { return value === 1; }
function readStateContract(activation, valueName, valueVersion) {
  if (activation !== "tracked") return null;
  return { activation };
}`;
    const output = instrumentStartupModule(code, id.replace("wasm_session_checkpoint", "wasm_profile_descriptor"), "./recorder")!;
    const record = vi.fn();
    const run = new Function("__breditorStartupRejection", output.code.slice(output.code.indexOf("\n") + 1) + ";return readStateContract;")(record) as (...args: unknown[]) => unknown;
    expect(run("tracked", "private/name", 1)).toEqual({ activation: "tracked" });
    expect(record).not.toHaveBeenCalled();
    expect(run("unknown", "private/name", 1)).toBeNull();
    expect(record).toHaveBeenCalledExactlyOnceWith("descriptor:readStateContract:4", {
      activationTag: 0, version: 1, versionType: 1, nameType: 1,
      nameQualifiedRecheck: 1, versionValidRecheck: 1,
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain("private/name");
  });
});
