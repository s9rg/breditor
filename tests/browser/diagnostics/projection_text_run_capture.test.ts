import { expect, it, vi } from "vitest";
import { instrumentLinkFaults } from "./link_fault_instrumentation";
import { createLinkFaultRecorder } from "./link_fault_recorder";

const id = "/repo/packages/breditor-browser/dist/wasm_projection_adapter.js";
const source = `function readSemanticProjection(text, formatCount) {
  const runIndex = 6;
  if (typeof text !== "string" || formatCount === undefined || !isIndex(formatCount) || formatCount > 32) {
    return projectionFailure("projection.invalid_shape");
  }
  return "accepted";
}`;

it("captures only rejected locals, not document text or repeated getters", () => {
  const output = instrumentLinkFaults(source, id, "/r.js", { numericPredicates: false, projectionTextRun: true })!;
  const make = new Function("__breditorProjectionTextRun", "projectionFailure", "isIndex",
    output.code.split("\n").slice(1).join("\n") + "\nreturn readSemanticProjection;");
  const recorder = createLinkFaultRecorder();
  const observe = vi.fn(recorder.textRun);
  const rejected = Object.freeze({ ok: false });
  const failure = vi.fn(() => rejected);
  const run = make(observe, failure, (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0);
  expect(run("private document text", 0)).toBe("accepted");
  expect(run("private document text", 32)).toBe("accepted");
  expect(observe).not.toHaveBeenCalled();
  expect(run("private document text", 33)).toBe(rejected);
  expect(failure).toHaveBeenCalledOnce();
  expect(recorder.snapshot().textRuns).toEqual([expect.objectContaining({
    textType: "string", index: expect.objectContaining({ decimal: "6" }),
    formatCount: expect.objectContaining({ decimal: "33" }), laterAboveLimit: true,
  })]);
  expect(JSON.stringify(recorder.snapshot())).not.toContain("private document text");
});

it("does not coerce invalid values and bounds retained snapshots", () => {
  const recorder = createLinkFaultRecorder();
  const value = new Proxy({}, { get() { throw new Error("must not inspect"); } });
  for (let i = 0; i < 20; i++) expect(recorder.textRun("wasm_projection_adapter:failure:303", value, value, "object", value)).toBe(value);
  expect(recorder.snapshot().textRuns).toHaveLength(8);
  expect(recorder.snapshot().textRuns[0]).toMatchObject({ index: { type: "object" }, formatCount: { type: "object" } });
});

it("fails closed when the specific rejection guard changes", () => {
  expect(() => instrumentLinkFaults(source.replace("formatCount > 32", "formatCount > 64"), id,
    "/r.js", { projectionTextRun: true })).toThrow("Expected one projection text-run rejection");
});
