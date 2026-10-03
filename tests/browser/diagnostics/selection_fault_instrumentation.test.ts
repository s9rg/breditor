import { readFileSync } from "node:fs";
import { parseSync, type ESTree } from "rolldown/utils";
import { expect, it, vi } from "vitest";
import { instrumentLinkFaults } from "./link_fault_instrumentation";

const id = "/repo/packages/breditor-browser/dist/wasm_selection_adapter.js";

it("cold selection capture leaves numeric predicates and all non-rejection code byte-identical", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url), "utf8");
  const output = instrumentLinkFaults(source, id, "/r.js", { numericPredicates: false })!;
  expect(output.sites.some(site => site.stage.includes(":numeric:"))).toBe(false);
  expect(output.sites.some(site => site.stage.includes(":point:"))).toBe(true);
  const body = output.code.split("\n").slice(1).join("\n");
  const parsed = parseSync(id, body);
  expect(parsed.errors).toEqual([]);
  const edits: { start: number; end: number; text: string }[] = [];
  function visit(node: ESTree.Node): void {
    if (node.type === "CallExpression" && node.callee.type === "Identifier") {
      if (node.callee.name === "__breditorLinkThrow") {
        const value = node.arguments[1]!;
        const wrapped = body.slice(value.start, value.end);
        expect(wrapped.startsWith("(") && wrapped.endsWith(")")).toBe(true);
        edits.push({ start: node.start, end: node.end, text: wrapped.slice(1, -1) });
        return;
      }
      if (node.callee.name === "__breditorSelectionPoint") {
        edits.push({ start: node.start, end: node.end, text: "null" });
        return;
      }
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) visit(child as ESTree.Node);
    }
  }
  visit(parsed.program);
  expect(edits).toHaveLength(output.sites.length);
  let restored = body;
  for (const edit of edits.sort((a, b) => b.start - a.start)) restored = restored.slice(0, edit.start) + edit.text + restored.slice(edit.end);
  expect(restored).toBe(source);
});

it("records a rejected captured endpoint without observing successful numeric checks", () => {
  const source = `function isU32(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 4294967295; }
function readPoint(kind, nodeIndex, offset, affinity) {
  if (kind !== 'text' || !isU32(nodeIndex) || !isU32(offset) || affinity !== 'after') return null;
  return { kind, nodeIndex, offset, affinity };
}`;
  const output = instrumentLinkFaults(source, id, "/r.js", { numericPredicates: false })!;
  const point = vi.fn(() => null);
  const read = new Function("__breditorSelectionPoint", output.code.split("\n").slice(1).join("\n") + "; return readPoint;")(point);
  expect(read("text", 2, 0, "after")).toEqual({ kind: "text", nodeIndex: 2, offset: 0, affinity: "after" });
  expect(point).not.toHaveBeenCalled();
  expect(read("text", 2, -1, "after")).toBeNull();
  expect(point).toHaveBeenCalledExactlyOnceWith("wasm_selection_adapter:point:3", "text", 2, -1, "after");
});
