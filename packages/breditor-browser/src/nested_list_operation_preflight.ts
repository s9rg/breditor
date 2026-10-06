import { durableDocumentRootMatchesContract, durableNestedFragmentRootMatchesContract, exactJsonRecord, type ResolvedWasmDurableJsonContract } from "./wasm_document_json.js";

type WireNode = Record<string, unknown>;
interface Block { path: number[]; node: WireNode }

/**
 * Static admission for the four guarded V7 nested operation recipes.
 * Undefined delegates other tags to their own validator; it is not acceptance.
 * Rust remains responsible for live guards, derived inverses and replay.
 * @internal
 */
export function nestedListOperationPreflight(value: WireNode, contract: ResolvedWasmDurableJsonContract,
  validFragment: (value: unknown) => boolean): boolean | undefined {
  if (!["nestedListReframe", "nestedListFormatRewrite", "nestedListTextSplice", "nestedListTextReplace"].includes(String(value["kind"]))) return undefined;
  if (contract.mode !== "v7") return false;
  if (value["kind"] === "nestedListTextReplace") {
    const op = exactJsonRecord(value, ["kind", "guardStart", "start", "end", "expected", "inserted", "layout"]);
    if (op === null || !index(op["guardStart"])) return false;
    const start = boundary(op["start"]), end = boundary(op["end"]);
    const expected = roots(op["expected"], contract), layout = roots(op["layout"], contract);
    if (start === null || end === null || expected === null || layout === null ||
      op["guardStart"] + expected.length > 10_000 || op["guardStart"] + layout.length > 10_000 ||
      !durableNestedFragmentRootMatchesContract(op["inserted"], contract)) return false;
    const inserted = (op["inserted"] as WireNode)["children"] as WireNode[];
    if (!inserted.every(textBlock)) return false;
    const source = blocks(expected), slots = blocks(layout);
    const locate = (path: number[]) => source.findIndex(entry => entry.path.length === path.length &&
      entry.path.every((part, depth) => part === (depth === 0 ? path[0]! - (op["guardStart"] as number) : path[depth])));
    const first = locate(start.block), last = locate(end.block);
    if (first < 0 || last < first || (first === last && start.offset > end.offset) ||
      !scalarBoundary(text(source[first]!.node), start.offset) || !scalarBoundary(text(source[last]!.node), end.offset)) return false;
    return slots.length === source.length - (last - first + 1) + inserted.length &&
      slots.every(entry => entry.node["type"] === "breditor/paragraph" && (entry.node["children"] as unknown[]).length === 0);
  }
  if (value["kind"] === "nestedListTextSplice") {
    const op = exactJsonRecord(value, ["kind", "block", "start", "end", "expected", "replacement"]);
    if (op === null || !blockPath(op["block"]) || !offset(op["start"]) || !offset(op["end"]) || op["start"] > op["end"] || !validFragment(op["replacement"])) return false;
    const expected = roots(op["expected"], contract);
    if (expected === null || expected.length !== 1) return false;
    const path = op["block"];
    const block = blocks(expected).find(entry => entry.path.length === path.length && entry.path.every((part, depth) => part === (depth === 0 ? 0 : path[depth])));
    return block !== undefined && scalarBoundary(text(block.node), op["start"]) && scalarBoundary(text(block.node), op["end"]);
  }
  const op = exactJsonRecord(value, ["kind", "start", "expected", "replacement"]);
  if (op === null || !index(op["start"])) return false;
  const expected = roots(op["expected"], contract), replacement = roots(op["replacement"], contract);
  if (expected === null || replacement === null || op["start"] + expected.length > 10_000 || op["start"] + replacement.length > 10_000) return false;
  if (op["kind"] === "nestedListFormatRewrite") return JSON.stringify(expected.map(formatless)) === JSON.stringify(replacement.map(formatless));
  const before = blocks(expected), after = blocks(replacement);
  return before.length === after.length && before.every((entry, i) => JSON.stringify(entry.node) === JSON.stringify(after[i]!.node));
}

function roots(value: unknown, contract: ResolvedWasmDurableJsonContract): WireNode[] | null {
  return durableDocumentRootMatchesContract(value, contract) ? (value as WireNode)["children"] as WireNode[] : null;
}
function textBlock(node: WireNode): boolean { return node["type"] === "breditor/paragraph" || node["type"] === "breditor/heading"; }
function text(node: WireNode): string { return (node["children"] as WireNode[]).map(run => run["text"] as string).join(""); }
function blocks(roots: WireNode[]): Block[] {
  const result: Block[] = [];
  const visit = (node: WireNode, path: number[]) => {
    if (textBlock(node)) { result.push({path, node}); return; }
    (node["children"] as WireNode[]).forEach((child, index) => visit(child, [...path, index]));
  };
  roots.forEach((root, index) => visit(root, [index]));
  return result;
}
function formatless(node: WireNode): unknown {
  return [node["type"], node["properties"], textBlock(node) ? text(node) : (node["children"] as WireNode[]).map(formatless)];
}
function offset(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function index(value: unknown): value is number { return offset(value) && value < 10_000; }
function blockPath(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 63 && value.length % 2 === 1 &&
    (value.length === 1 || value[value.length - 1] === 0) && value.every(index);
}
function boundary(value: unknown): {block: number[]; offset: number} | null {
  const record = exactJsonRecord(value, ["block", "offset"]);
  return record !== null && blockPath(record["block"]) && offset(record["offset"])
    ? {block: record["block"], offset: record["offset"]} : null;
}
function scalarBoundary(text: string, offset: number): boolean {
  return offset <= text.length && (offset === 0 || offset === text.length ||
    !(text.charCodeAt(offset - 1) >= 0xd800 && text.charCodeAt(offset - 1) <= 0xdbff && text.charCodeAt(offset) >= 0xdc00 && text.charCodeAt(offset) <= 0xdfff));
}
