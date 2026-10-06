import { describe, expect, it } from "vitest";
import { nestedListOperationPreflight } from "./nested_list_operation_preflight.js";
import { resolveWasmDurableJsonContract } from "./wasm_document_json.js";

describe("nested operation static admission", () => {
  const contract = resolveWasmDurableJsonContract({mode: "v7", schema: {name: "test/document", version: 1, fingerprint: `sha256:${"a".repeat(64)}`}, formats: []})!;
  const element = (type: string, children: unknown[]) => ({kind: "element", type: `breditor/${type}`, entityId: null, properties: {}, children});
  const block = (text: string) => element("paragraph", [{kind: "text", text, formats: []}]);
  const tree = (text = "a🙂") => element("document", [element("bullet-list", [element("list-item", [block("parent"), element("bullet-list", [element("list-item", [block(text)])])])])]);
  it("checks nested splice locations and scalar boundaries", () => {
    const op = {kind: "nestedListTextSplice", block: [4, 0, 1, 0, 0], start: 1, end: 3, expected: tree(), replacement: {runs: []}};
    expect(nestedListOperationPreflight(op, contract, () => true)).toBe(true);
    expect(nestedListOperationPreflight({...op, end: 2}, contract, () => true)).toBe(false);
    expect(nestedListOperationPreflight({...op, block: [4, 0, 2, 0, 0]}, contract, () => true)).toBe(false);
    expect(nestedListOperationPreflight(op, contract, () => false)).toBe(false);
  });
  it("preserves exact block order in reframing and topology in format rewrites", () => {
    const replacement = element("document", [block("parent"), block("a🙂")]);
    const op = {kind: "nestedListReframe", start: 0, expected: tree(), replacement};
    expect(nestedListOperationPreflight(op, contract, () => true)).toBe(true);
    expect(nestedListOperationPreflight({...op, replacement: element("document", [block("a🙂"), block("parent")])}, contract, () => true)).toBe(false);
    expect(nestedListOperationPreflight({...op, kind: "nestedListFormatRewrite"}, contract, () => true)).toBe(false);
    expect(nestedListOperationPreflight({...op, kind: "nestedListFormatRewrite", replacement: tree()}, contract, () => true)).toBe(true);
    expect(nestedListOperationPreflight({...op, kind: "nestedListFormatRewrite", replacement: tree("different")}, contract, () => true)).toBe(false);
  });
});
