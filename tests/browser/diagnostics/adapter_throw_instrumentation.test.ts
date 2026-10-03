import { readFileSync } from "node:fs";
import { parseSync, type ESTree } from "rolldown/utils";
import { expect, it, vi } from "vitest";
import { instrumentAdapterThrows } from "./adapter_throw_instrumentation";
import { createQueueFaultRecorder, recordAdapterThrow } from "./queue_fault_recorder";

const id = "/repo/packages/breditor-browser/dist/wasm_command_adapter.js";

it("leaves successful calls untouched and preserves throw identity with one operand evaluation", () => {
  const source = "function run(ok, operand) { if (ok) return 42; throw operand(); }";
  const output = instrumentAdapterThrows(source, id, "/recorder.js")!;
  const observe = vi.fn((_stage: string, value: unknown) => value);
  const run = new Function("__breditorAdapterThrow", output.code.split("\n").slice(1).join("\n") + "; return run;")(observe);
  const original = { message: "Wasm semantic selection is invalid" };
  const operand = vi.fn(() => original);
  expect(run(true, operand)).toBe(42);
  expect(operand).not.toHaveBeenCalled();
  expect(observe).not.toHaveBeenCalled();
  let caught;
  try { run(false, operand); } catch (error) { caught = error; }
  expect(caught).toBe(original);
  expect(operand).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledExactlyOnceWith("wasm_command_adapter:throw:1", original);
  observe.mockClear();
  operand.mockImplementation(() => { throw original; });
  try { run(false, operand); } catch (error) { expect(error).toBe(original); }
  expect(observe).not.toHaveBeenCalled(); // An operand failure is not this throw site.
});

it("only wraps existing throw operands in the emitted adapter, with exact source restoration", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_command_adapter.js", import.meta.url), "utf8");
  const output = instrumentAdapterThrows(source, id, "/recorder.js")!;
  const body = output.code.split("\n").slice(1).join("\n");
  const parsed = parseSync(id, body);
  expect(parsed.errors).toEqual([]);
  const edits: { start: number; end: number; original: string }[] = [];
  function visit(node: ESTree.Node, parent?: ESTree.Node): void {
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "__breditorAdapterThrow") {
      expect(parent?.type).toBe("ThrowStatement");
      const operand = node.arguments[1]!;
      const wrapped = body.slice(operand.start, operand.end);
      expect(wrapped.startsWith("(") && wrapped.endsWith(")")).toBe(true);
      edits.push({ start: node.start, end: node.end, original: wrapped.slice(1, -1) });
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) visit(child as ESTree.Node, node);
    }
  }
  visit(parsed.program);
  expect(edits.length).toBeGreaterThan(0);
  expect(edits).toHaveLength(output.sites.length);
  let restored = body;
  for (const edit of edits.sort((a, b) => b.start - a.start)) restored = restored.slice(0, edit.start) + edit.original + restored.slice(edit.end);
  expect(restored).toBe(source);
});

it("rejects drift, duplicate installation and unrelated modules", () => {
  expect(instrumentAdapterThrows("throw 1;", id.replace("wasm_command_adapter", "command_queue"), "/r.js")).toBeNull();
  expect(() => instrumentAdapterThrows("throw ;", id, "/r.js")).toThrow("Cannot parse");
  expect(() => instrumentAdapterThrows("function x() {}", id, "/r.js")).toThrow("Expected adapter throw sites");
  const output = instrumentAdapterThrows("throw 1;", id, "/r.js")!;
  expect(() => instrumentAdapterThrows(output.code, id, "/r.js")).toThrow("already installed");
});

it("admits only closed adapter stages and keeps sink failures from replacing the throw", () => {
  const recorder = createQueueFaultRecorder(() => { throw new Error("sink failed"); });
  const error = { message: "Wasm semantic selection is invalid" };
  recorder.record("wasm_command_adapter:throw:1321", error);
  recorder.record("arbitrary:throw:1", error);
  expect(recorder.snapshot().events).toEqual([{ stage: "wasm_command_adapter:throw:1321", reason: error.message, frames: [] }]);
  const log = vi.spyOn(console, "debug").mockImplementation(() => { throw new Error("sink failed"); });
  try { expect(recordAdapterThrow("wasm_command_adapter:throw:1321", error)).toBe(error); }
  finally { log.mockRestore(); }
});
