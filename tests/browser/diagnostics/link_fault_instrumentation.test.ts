import { expect, it, vi } from "vitest";
import { instrumentLinkFaults } from "./link_fault_instrumentation";
import { createLinkFaultRecorder } from "./link_fault_recorder";

const id = "/repo/packages/breditor-browser/dist/wasm_command_adapter.js";
it.each(["command_queue", "browser_event_router"])("captures %s fail-stop calls without inspecting arguments", (module) => {
  const method = module === "command_queue" ? "fail" : "fault";
  const output = instrumentLinkFaults(`class Owner { #${method}(value) { return value; } run(value) { return this.#${method}(value); } }`,
    id.replace("wasm_command_adapter", module), "/recorder.js")!;
  const run = new Function("__breditorLinkThrow", "value",
    output.code.split("\n").slice(1).join("\n") + "\nreturn new Owner().run(value);");
  const recorder = createLinkFaultRecorder();
  const value = new Proxy({}, { get() { throw new Error("do not inspect"); } });
  expect(run(recorder.record, value)).toBe(value);
  expect(recorder.snapshot().events).toEqual([`${module}:failure:1`]);
});

it.each(["selection_adapter", "projection_adapter"])("captures original numeric rejection in %s", (module) => {
  const name = module === "selection_adapter" ? "isU32" : "isIndex";
  const output = instrumentLinkFaults(`function ${name}(value) { return check(value); }`,
    id.replace("wasm_command_adapter", `wasm_${module}`), "/recorder.js")!;
  const run = new Function("__breditorNumericPredicate", "check",
    output.code.split("\n").slice(1).join("\n") + `\nreturn ${name}(2);`);
  const recorder = createLinkFaultRecorder();
  const check = vi.fn(() => false);
  expect(run(recorder.numericPredicate, check)).toBe(false);
  expect(check).toHaveBeenCalledOnce();
  expect(recorder.snapshot().numeric).toHaveLength(1);
  expect(recorder.snapshot().numeric[0]).toMatchObject({ originalResult: false, value: { decimal: "2", bits: "4000000000000000" } });
});
it("records content failures without reading return objects or changing results", () => {
  const recorder = createLinkFaultRecorder();
  const foreign = new Proxy({}, { get() { throw new Error("do not inspect"); } });
  expect(recorder.contentResult("wasm_document_json:result:10", foreign)).toBe(foreign);
  expect(recorder.contentResult("wasm_document_json:result:10", 0)).toBe(0);
  expect(recorder.contentResult("wasm_document_json:result:10", null)).toBeNull();
  expect(recorder.contentResult("wasm_document_json:result:11", false)).toBe(false);
  expect(recorder.snapshot().events).toEqual(["wasm_document_json:result:10", "wasm_document_json:result:11"]);
});

it("captures bounded loop-count bits separately from numeric return transport", () => {
  const emit = vi.fn(() => { throw new Error("sink unavailable"); });
  const recorder = createLinkFaultRecorder(undefined, undefined, emit);
  recorder.loop(60);
  recorder.loop(NaN);
  recorder.loop(new Proxy({}, { get() { throw new Error("do not inspect"); } }));
  for (let i = 0; i < 20; i++) recorder.loop(60);
  expect(recorder.snapshot().loops).toHaveLength(8);
  expect(recorder.snapshot().loops[0]).toMatchObject({ decimal: "60", bits: "404e000000000000" });
  expect(recorder.snapshot().loops[1]).toMatchObject({ decimal: "NaN" });
  expect(recorder.snapshot().loops[2]).toEqual({ type: "object" });
  expect(emit).toHaveBeenCalledTimes(8);
});
it("instruments only the chosen boundary modules and refuses duplicate instrumentation", () => {
  expect(instrumentLinkFaults("throw 1;", "/other.js", "/recorder.js")).toBeNull();
  const result = instrumentLinkFaults("throw 1;", id, "/recorder.js")!;
  expect(result.sites).toEqual([{ stage: "wasm_command_adapter:throw:1", line: 1 }]);
  expect(result.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(() => instrumentLinkFaults(result.code, id, "/recorder.js")).toThrow("already installed");
  expect(() => instrumentLinkFaults("const x = 1;", id, "/recorder.js")).toThrow("No throw sites");
});

it("evaluates the original operand once and throws the exact original identity", () => {
  const transformed = instrumentLinkFaults("throw create();", id, "/recorder.js")!;
  const execute = new Function("__breditorLinkThrow", "create", transformed.code.split("\n").slice(1).join("\n"));
  const recorder = createLinkFaultRecorder();
  const original = Object.freeze({ message: "private document text" });
  const create = vi.fn(() => original);
  let thrown: unknown;
  try { execute(recorder.record, create); } catch (error) { thrown = error; }
  expect(thrown).toBe(original);
  expect(create).toHaveBeenCalledOnce();
  expect(recorder.snapshot().events).toEqual(["wasm_command_adapter:throw:1"]);
  expect(JSON.stringify(recorder.snapshot())).not.toContain("private");
  const failedOperand = createLinkFaultRecorder();
  try { execute(failedOperand.record, () => { throw original; }); } catch (error) { expect(error).toBe(original); }
  expect(failedOperand.snapshot().events).toEqual([]);
});

it("bounds recordings and never reads or retains the thrown value", () => {
  const recorder = createLinkFaultRecorder();
  const value = new Proxy({}, { get() { throw new Error("must not inspect error"); } });
  for (let i = 0; i < 40; i++) expect(recorder.record("wasm_selection_adapter:throw:1", value)).toBe(value);
  expect(recorder.snapshot()).toMatchObject({ omitted: 8 });
  expect(recorder.snapshot().events).toHaveLength(32);
  recorder.snapshot().events.length = 0;
  expect(recorder.snapshot().events).toHaveLength(32);
  recorder.record("private text", value);
  expect(recorder.snapshot().omitted).toBe(8);
});

it("contains trace-sink failures without replacing the original error", () => {
  const original = {};
  const emit = vi.fn(() => { throw new Error("trace sink unavailable"); });
  const recorder = createLinkFaultRecorder(emit);
  expect(recorder.record("wasm_command_adapter:throw:1", original)).toBe(original);
  expect(emit).toHaveBeenCalledWith("wasm_command_adapter:throw:1");
  expect(recorder.snapshot().events).toEqual(["wasm_command_adapter:throw:1"]);
});

it("records failed editor deliveries without changing successful returns or object identity", () => {
  const source = 'function run(failed) { return Object.freeze({ status: failed ? "failed" : "completed" }); }';
  // A dynamic status is deliberately not rewritten: only static failure sites.
  expect(() => instrumentLinkFaults(source, id.replace("wasm_command_adapter", "browser_editor"), "/recorder.js"))
    .toThrow("No throw sites");
  const output = instrumentLinkFaults('function run(failed) { if (failed) return Object.freeze({ status: "failed" }); return Object.freeze({ status: "completed" }); }',
    id.replace("wasm_command_adapter", "browser_editor"), "/recorder.js")!;
  const execute = new Function("__breditorLinkThrow", "failed", output.code.split("\n").slice(1).join("\n") + "\nreturn run(failed);");
  const recorder = createLinkFaultRecorder();
  expect(execute(recorder.record, false)).toEqual({ status: "completed" });
  expect(recorder.snapshot().events).toEqual([]);
  const failed = execute(recorder.record, true);
  expect(failed).toEqual({ status: "failed" });
  expect(Object.isFrozen(failed)).toBe(true);
  expect(recorder.snapshot().events).toEqual(["browser_editor:failure:1"]);
});

it("ignores provisional selection defaults but captures actual failure returns", () => {
  const source = 'function run(failed) { let result = selectionFailure("default"); if (failed) return selectionFailure("rejected"); return { ok: true }; }';
  const output = instrumentLinkFaults(source, id.replace("wasm_command_adapter", "wasm_selection_adapter"), "/recorder.js")!;
  const execute = new Function("__breditorLinkThrow", "selectionFailure", "failed",
    output.code.split("\n").slice(1).join("\n") + "\nreturn run(failed);");
  const recorder = createLinkFaultRecorder();
  const failure = vi.fn(code => ({ ok: false, code }));
  expect(execute(recorder.record, failure, false)).toEqual({ ok: true });
  expect(recorder.snapshot().events).toEqual([]);
  expect(failure).toHaveBeenCalledTimes(1);
  failure.mockClear();
  expect(execute(recorder.record, failure, true)).toEqual({ ok: false, code: "rejected" });
  expect(failure).toHaveBeenCalledTimes(2);
  expect(recorder.snapshot().events).toEqual(["wasm_selection_adapter:failure:1"]);
});

it("captures only rejected point locals without rerunning the original predicate", () => {
  const source = 'function readPoint(kind, nodeIndex, offset, affinity) { if (!isU32(nodeIndex) || !isU32(offset)) return null; return {kind, nodeIndex, offset, affinity}; }';
  const output = instrumentLinkFaults(source, id.replace("wasm_command_adapter", "wasm_selection_adapter"), "/recorder.js")!;
  const execute = new Function("__breditorSelectionPoint", "isU32", "offset",
    output.code.split("\n").slice(1).join("\n") + '\nreturn readPoint("text", 2, offset, "after");');
  const recorder = createLinkFaultRecorder();
  const check = vi.fn((value: number) => Number.isSafeInteger(value) && value >= 0);
  expect(execute(recorder.point, check, 0)).toMatchObject({ nodeIndex: 2, offset: 0 });
  expect(recorder.snapshot().points).toEqual([]);
  expect(check).toHaveBeenCalledTimes(2);
  check.mockClear();
  expect(execute(recorder.point, check, -1)).toBeNull();
  expect(check).toHaveBeenCalledTimes(2);
  expect(recorder.snapshot().points).toEqual([{
    stage: "wasm_selection_adapter:point:1", kind: "text", affinity: "after",
    nodeIndex: { type: "number", decimal: "2", bits: "4000000000000000", recheck: { safeInteger: true, nonnegative: true, withinU32: true } },
    offset: { type: "number", decimal: "-1", bits: "bff0000000000000", recheck: { safeInteger: true, nonnegative: false, withinU32: true } },
  }]);
  // A later successful recheck must never turn the original rejection into
  // acceptance, even when all captured values look valid afterward.
  check.mockClear();
  check.mockImplementationOnce(() => false);
  expect(execute(recorder.point, check, 0)).toBeNull();
  expect(check).toHaveBeenCalledTimes(1); // Original OR still short-circuits.
  expect(recorder.snapshot().points[1]).toMatchObject({
    nodeIndex: { recheck: { safeInteger: true, nonnegative: true, withinU32: true } },
    offset: { bits: "0000000000000000" },
  });
});

it("bounds point captures, redacts foreign values and contains sink failures", () => {
  const emit = vi.fn(() => { throw new Error("sink failed"); });
  const recorder = createLinkFaultRecorder(undefined, emit);
  const value = new Proxy({}, { get() { throw new Error("must not inspect"); } });
  for (let index = 0; index < 40; index++) {
    expect(recorder.point("wasm_selection_adapter:point:1", "private text", value, -0, value)).toBeNull();
  }
  expect(emit).toHaveBeenCalledTimes(32);
  expect(recorder.snapshot().points).toHaveLength(32);
  expect(recorder.snapshot().points[0]).toMatchObject({
    kind: "string", nodeIndex: { type: "object" }, affinity: "object",
    offset: { decimal: "0", bits: "8000000000000000" },
  });
  expect(JSON.stringify(recorder.snapshot())).not.toContain("private");
  recorder.snapshot().points.length = 0;
  expect(recorder.snapshot().points).toHaveLength(32);
});
