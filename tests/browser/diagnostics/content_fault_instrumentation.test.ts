import { expect, it, vi } from "vitest";
import { instrumentContentFaults } from "./content_fault_instrumentation";
import { createLinkFaultRecorder } from "./link_fault_recorder";

const id = "/repo/packages/breditor-browser/dist/wasm_document_json.js";
it("captures an original numeric rejection without overriding it with later valid rechecks", () => {
  const source = "function isU32(value) { return integer(value) && lower(value) && upper(value); }";
  const output = instrumentContentFaults(source, id, "/recorder.js")!;
  const run = new Function("__breditorNumericPredicate", "integer", "lower", "upper",
    output.code.split("\n").slice(1).join("\n") + "\nreturn isU32(2048);");
  const recorder = createLinkFaultRecorder();
  const integer = vi.fn(() => false);
  const lower = vi.fn(() => true);
  const upper = vi.fn(() => true);
  expect(run(recorder.numericPredicate, integer, lower, upper)).toBe(false);
  expect(integer).toHaveBeenCalledOnce();
  expect(lower).not.toHaveBeenCalled();
  expect(upper).not.toHaveBeenCalled();
  expect(recorder.snapshot().numeric[0]).toMatchObject({
    stage: "wasm_document_json:numeric:1:operand:0", originalResult: false,
    value: { decimal: "2048", bits: "40a0000000000000" },
  });
  expect(recorder.snapshot().numeric.slice(1)).toEqual([{
    stage: "wasm_document_json:numeric:1", originalResult: false,
    value: { type: "number", decimal: "2048", bits: "40a0000000000000",
      recheck: { safeInteger: true, nonnegative: true, withinU32: true } },
  }]);
});

it.each([0, 1, 2])("identifies the original false operand %s without evaluating later checks", (failed) => {
  const source = "function isU32(value) { return first(value) && second(value) && third(value); }";
  const output = instrumentContentFaults(source, id, "/recorder.js")!;
  const run = new Function("__breditorNumericPredicate", "first", "second", "third",
    output.code.split("\n").slice(1).join("\n") + "\nreturn isU32(2048);");
  const calls: number[] = [];
  const checks = [0, 1, 2].map(index => vi.fn(() => { calls.push(index); return index !== failed; }));
  const recorder = createLinkFaultRecorder();
  expect(run(recorder.numericPredicate, ...checks)).toBe(false);
  expect(calls).toEqual([0, 1, 2].slice(0, failed + 1));
  expect(recorder.snapshot().numeric).toHaveLength(2);
  expect(recorder.snapshot().numeric[0]).toMatchObject({
    stage: `wasm_document_json:numeric:1:operand:${failed}`, originalResult: false,
    value: { decimal: "2048", recheck: { safeInteger: true, nonnegative: true, withinU32: true } },
  });
  expect(output.sites.find(site => site.stage.endsWith(`:operand:${failed}`))?.expression)
    .toBe(["first(value)", "second(value)", "third(value)"][failed]);
});

it("contains numeric sink failures and never coerces rejected foreign values", () => {
  const recorder = createLinkFaultRecorder(undefined, undefined, undefined, () => { throw new Error("sink failed"); });
  const value = new Proxy({}, { get() { throw new Error("do not read"); } });
  expect(recorder.numericPredicate("wasm_session_checkpoint:numeric:1", true, value)).toBe(true);
  expect(recorder.snapshot().numeric).toEqual([]);
  for (let i = 0; i < 40; i++) expect(recorder.numericPredicate("wasm_session_checkpoint:numeric:1", false, value)).toBe(false);
  expect(recorder.snapshot().numeric).toHaveLength(32);
  expect(recorder.snapshot().numeric[0]).toMatchObject({ value: { type: "object" } });
});
it("captures selected return values once and preserves short-circuit evaluation", () => {
  const source = "function documentJsonMatchesProjection() { return first() && second(); }";
  const output = instrumentContentFaults(source, id, "/recorder.js")!;
  const run = new Function("__breditorContentResult", "first", "second",
    output.code.split("\n").slice(1).join("\n") + "\nreturn documentJsonMatchesProjection();");
  const record = vi.fn((_stage, result) => result);
  const first = vi.fn(() => false);
  const second = vi.fn(() => true);
  expect(run(record, first, second)).toBe(false);
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  expect(record).toHaveBeenCalledWith("wasm_document_json:result:1", false);
});

it("ignores provisional defaults and nested callbacks", () => {
  const source = "function documentJsonUtf8Bytes() { const callback = () => { return null; }; return callback(); } function read() { let provisional = boundaryFailure(); return boundaryFailure(); }";
  const output = instrumentContentFaults(source, id, "/recorder.js")!;
  expect(output.sites).toHaveLength(2);
  expect(output.code).toContain("return null;");
  expect(output.code).toContain("let provisional = boundaryFailure();");
  expect(() => instrumentContentFaults(output.code, id, "/recorder.js")).toThrow("already installed");
  expect(instrumentContentFaults(source, "/other.js", "/recorder.js")).toBeNull();
});
