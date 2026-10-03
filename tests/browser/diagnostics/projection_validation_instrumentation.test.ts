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

it.each([[false, true], [true, true], [true, false]])("round-trips the emitted projection module (required=%s, source=%s)", (requiredProperty, requiredPropertySource) => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/projection.js", import.meta.url), "utf8");
  const output = instrumentProjectionValidation(source, id, "/recorder.js", { requiredProperty, requiredPropertySource })!;
  const body = output.code.split("\n").slice(1).join("\n");
  const parsed = parseSync(id, body);
  expect(parsed.errors).toEqual([]);
  const edits: { start: number; end: number; original: string }[] = [];
  function visit(node: ESTree.Node): void {
    if (node.type === "CallExpression" && node.callee.type === "Identifier" &&
        ["__breditorProjectionReject", "__breditorRequiredProperty"].includes(node.callee.name)) {
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

it("restores the earlier seven-argument rejection call without reading a source binding", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/projection.js", import.meta.url), "utf8");
  const current = instrumentProjectionValidation(source, id, "/recorder.js", { requiredProperty: true })!;
  const earlier = instrumentProjectionValidation(source, id, "/recorder.js",
    { requiredProperty: true, requiredPropertySource: false })!;
  expect(earlier.code).toBe(current.code.replace("formatContract, propertyArray, properties, record)",
    "formatContract, propertyArray, properties)"));
  expect(earlier.sites).toEqual(current.sites);
  expect(earlier.sourceSha256).toBe(current.sourceSha256);
});

it("captures required-property locals only after the original check rejects", () => {
  const source = `function validateFormatDetails(format, contractIndex, formatContract, propertyArray, properties, record) {
    while (contractIndex < formatContract.properties.length) {
      if (formatContract.properties[contractIndex]?.presence === "required") return null;
      contractIndex += 1;
    }
    return properties;
  }`;
  const output = instrumentProjectionValidation(source, id, "/recorder.js", { requiredProperty: true })!;
  const run = new Function("__breditorRequiredProperty", "args",
    output.code.split("\n").slice(1).join("\n") + "\nreturn validateFormatDetails(...args);");
  const emit = vi.fn();
  const recorder = createLinkFaultRecorder(undefined, undefined, undefined, undefined, undefined, emit);
  const required = vi.fn(() => "required");
  const contract = { properties: [{ get presence() { return required(); } }] };
  const accepted: unknown[] = [];
  expect(run(recorder.requiredProperty, ["example/link", 1, contract, { values: [] }, accepted])).toBe(accepted);
  expect(emit).not.toHaveBeenCalled();
  expect(run(recorder.requiredProperty, ["example/link", 0, contract, { values: [] }, accepted,
    { properties: [{ name: "example/href", value: "private URL" }] }])).toBeNull();
  expect(required).toHaveBeenCalledOnce();
  expect(emit).toHaveBeenCalledOnce();
  expect(recorder.snapshot().requiredProperties[0]).toMatchObject({ source: { length: { decimal: "1" }, items: [{ name: "example/href", valueType: "string" }] } });
  expect(JSON.stringify(recorder.snapshot())).not.toContain("private URL");
  expect(() => instrumentProjectionValidation(source.replace('?.presence === "required"', '?.presence !== "optional"'), id,
    "/recorder.js", { requiredProperty: true })).toThrow("shape drift");
  expect(() => instrumentProjectionValidation(source.replace(/\brecord\b/g, "renamedRecord"), id,
    "/recorder.js", { requiredProperty: true })).toThrow("source record binding drift");
  expect(() => instrumentProjectionValidation("function other() { return null; }", id,
    "/recorder.js", { requiredProperty: true })).toThrow("Expected one");
});

it("bounds required-property snapshots and isolates stored evidence from callers and failing sinks", () => {
  const emit = vi.fn(() => { throw new Error("sink failure"); });
  const recorder = createLinkFaultRecorder(undefined, undefined, undefined, undefined, undefined, emit);
  const properties = [{ name: "example/href", value: "secret" }];
  for (let i = 0; i < 12; i++) expect(recorder.requiredProperty("projection:reject:405", null,
    "example/link", 1, { properties: [] }, { values: properties }, properties)).toBeNull();
  expect(emit).toHaveBeenCalledTimes(8);
  expect(recorder.snapshot().requiredProperties).toHaveLength(8);
  const snapshot = recorder.snapshot();
  (snapshot.requiredProperties[0] as { supplied: { items: unknown[] } }).supplied.items.length = 0;
  expect(recorder.snapshot().requiredProperties[0]).toMatchObject({ supplied: { items: [{ name: "example/href" }] } });
  expect(JSON.stringify(recorder.snapshot())).not.toContain("secret");
});

it("rejects duplicate or drifted instrumentation and ignores unrelated modules", () => {
  expect(instrumentProjectionValidation("", "/other.js", "/recorder.js")).toBeNull();
  expect(() => instrumentProjectionValidation("function ok() {}", id, "/recorder.js")).toThrow("No projection");
  expect(() => instrumentProjectionValidation("function {", id, "/recorder.js")).toThrow("Cannot parse");
  expect(() => instrumentProjectionValidation("__breditorProjectionReject", id, "/recorder.js")).toThrow("already installed");
});
