import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { parseSync, type ESTree } from "rolldown/utils";
import { instrumentProjectionValidation } from "./projection_validation_instrumentation";
import { createLinkFaultRecorder } from "./link_fault_recorder";

const id = "/repo/packages/breditor-browser/dist/projection.js";

it("retains only bounded static validator sites and contains observer errors", () => {
  const emit = vi.fn(() => { throw new Error("sink failure"); });
  const recorder = createLinkFaultRecorder(emit);
  const result = new Proxy({}, { get() { throw new Error("must not inspect"); } });
  for (let i = 0; i < 40; i++) expect(recorder.record("projection:reject:75", result)).toBe(result);
  expect(recorder.snapshot().events).toHaveLength(32);
  expect(recorder.snapshot().omitted).toBe(8);
  expect(emit).toHaveBeenCalledTimes(32);
  recorder.record("projection:reject:private", result);
  expect(recorder.snapshot().omitted).toBe(8);
});

it("records only existing rejection returns and preserves result identity and predicate evaluation", () => {
  const source = `function validate(input) {
    if (!check(input)) return validationFailure(code());
    if (input === null) return null;
    if (input === false) return { ok: false, resourceLimit: true };
    return { ok: true, value: input }; }`;
  const output = instrumentProjectionValidation(source, id, "/recorder.js")!;
  const observe = vi.fn((_stage, result) => result);
  const check = vi.fn(() => true);
  const code = vi.fn(() => "projection.invalid_shape");
  const rejected = Object.freeze({ ok: false });
  const fail = vi.fn(() => rejected);
  const run = new Function("__breditorProjectionReject", "check", "code", "validationFailure", "input",
    output.code.split("\n").slice(1).join("\n") + "\nreturn validate(input);");
  const invoke = (input: unknown) => run(observe, check, code, fail, input);
  expect(invoke("ok")).toEqual({ ok: true, value: "ok" });
  expect(check).toHaveBeenCalledOnce();
  expect(observe).not.toHaveBeenCalled();
  expect(invoke(null)).toBeNull();
  expect(invoke(false)).toEqual({ ok: false, resourceLimit: true });
  check.mockReturnValue(false);
  expect(invoke("invalid")).toBe(rejected);
  expect(code).toHaveBeenCalledOnce();
  expect(fail).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledTimes(3);
});

it("round-trips the entire emitted projection module and maps the profiled constructor and validators", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/projection.js", import.meta.url), "utf8");
  const output = instrumentProjectionValidation(source, id, "/recorder.js")!;
  const body = output.code.split("\n").slice(1).join("\n");
  const parsed = parseSync(id, body);
  expect(parsed.errors).toEqual([]);
  const edits: { start: number; end: number; original: string }[] = [];
  function visit(node: ESTree.Node): void {
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "__breditorProjectionReject") {
      const argument = node.arguments[1]!;
      const wrapped = body.slice(argument.start, argument.end);
      expect(wrapped.startsWith("(") && wrapped.endsWith(")")).toBe(true);
      edits.push({ start: node.start, end: node.end, original: wrapped.slice(1, -1) });
      return;
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) visit(child as ESTree.Node);
    }
  }
  visit(parsed.program);
  let restored = body;
  for (const edit of edits.sort((a, b) => b.start - a.start)) restored = restored.slice(0, edit.start) + edit.original + restored.slice(edit.end);
  expect(restored).toBe(source);
  expect(edits.length).toBe(output.sites.length);
  for (const name of ["createProfiledDocumentProjection", "validateProfiledProjection", "validateFormatDetails", "validateSnapshot", "exactDataRecord", "readExactBoundedArray"]) {
    expect(output.sites.some(site => site.function === name), name).toBe(true);
  }
});

it("rejects duplicate or drifted instrumentation and ignores unrelated modules", () => {
  expect(instrumentProjectionValidation("", "/other.js", "/recorder.js")).toBeNull();
  expect(() => instrumentProjectionValidation("function ok() {}", id, "/recorder.js")).toThrow("No projection");
  expect(() => instrumentProjectionValidation("function {", id, "/recorder.js")).toThrow("Cannot parse");
  expect(() => instrumentProjectionValidation("__breditorProjectionReject", id, "/recorder.js")).toThrow("already installed");
});
