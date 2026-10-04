import { durableDocumentRootMatchesContract, exactJsonRecord,
  type ResolvedWasmDurableJsonContract } from "./wasm_document_json.js";

type RecordValue = Record<string, unknown>;
interface BlockEntry { readonly path: readonly number[]; readonly block: RecordValue }
const MAX_CHILDREN = 10_000;

/**
 * Bounded static admission for the three explicit Operation V6 list recipes.
 * Undefined means an older tag: the caller must use its existing validator.
 * This is not replay. Rust proves live guards, derived results/inverses and
 * complete retained-history budgets before publishing a restored engine.
 * @internal
 */
export function flatListOperationPreflight(
  value: RecordValue,
  contract: ResolvedWasmDurableJsonContract,
  validFragment: (value: unknown) => boolean,
): boolean | undefined {
  switch (value["kind"]) {
    case "flatListReframe": {
      const op = exactJsonRecord(value, ["kind", "start", "expected", "replacement"]);
      if (op === null || !childIndex(op["start"])) return false;
      const expected = roots(op["expected"], contract), replacement = roots(op["replacement"], contract);
      if (expected === null || replacement === null || op["start"] + expected.length > MAX_CHILDREN ||
        op["start"] + replacement.length > MAX_CHILDREN) return false;
      const source = blocks(expected), result = blocks(replacement);
      return source.length === result.length && source.every((entry, index) =>
        blockSignature(entry.block) === blockSignature(result[index]!.block));
    }
    case "flatListTextSplice": {
      const op = exactJsonRecord(value, ["kind", "block", "start", "end", "expected", "replacement"]);
      if (op === null || !blockPath(op["block"]) || !offset(op["start"]) || !offset(op["end"]) ||
        op["start"] > op["end"] || !validFragment(op["replacement"])) return false;
      const expected = roots(op["expected"], contract);
      if (expected === null || expected.length !== 1) return false;
      const entry = findBlock(blocks(expected), op["block"], op["block"][0]!);
      return entry !== undefined && scalarBoundary(entry.block, op["start"]) && scalarBoundary(entry.block, op["end"]);
    }
    case "flatListTextReplace": {
      const op = exactJsonRecord(value, ["kind", "guardStart", "start", "end", "expected", "inserted", "layout"]);
      if (op === null || !childIndex(op["guardStart"])) return false;
      const start = boundary(op["start"]), end = boundary(op["end"]);
      const expected = roots(op["expected"], contract), inserted = roots(op["inserted"], contract);
      if (start === null || end === null || expected === null || inserted === null ||
        inserted.some(root => !textBlock(root)) || op["guardStart"] + expected.length > MAX_CHILDREN) return false;
      const source = blocks(expected);
      const first = findBlock(source, start.block, op["guardStart"]), last = findBlock(source, end.block, op["guardStart"]);
      if (first === undefined || last === undefined || !scalarBoundary(first.block, start.offset) ||
        !scalarBoundary(last.block, end.offset)) return false;
      const firstIndex = source.indexOf(first), lastIndex = source.indexOf(last);
      if (firstIndex > lastIndex || (firstIndex === lastIndex && start.offset > end.offset)) return false;
      const layout = op["layout"];
      if (!Array.isArray(layout) || layout.length === 0 || op["guardStart"] + layout.length > MAX_CHILDREN) return false;
      let resultBlocks = 0;
      for (const value of layout) {
        const bare = exactJsonRecord(value, ["kind"]);
        if (bare?.["kind"] === "block") { resultBlocks += 1; continue; }
        const list = exactJsonRecord(value, ["kind", "items"]) ?? exactJsonRecord(value, ["kind", "start", "items"]);
        if (list === null || !offset(list["items"]) || list["items"] === 0 || list["items"] > MAX_CHILDREN) return false;
        if (list["kind"] === "ordered") {
          if (!offset(list["start"]) || list["start"] < 1 || list["start"] + list["items"] - 1 > 2_147_483_647) return false;
        } else if (list["kind"] !== "bullet" || "start" in list) return false;
        resultBlocks += list["items"];
      }
      return resultBlocks === source.length - (lastIndex - firstIndex + 1) + inserted.length;
    }
    default: return undefined;
  }
}

function roots(value: unknown, contract: ResolvedWasmDurableJsonContract): RecordValue[] | null {
  return durableDocumentRootMatchesContract(value, contract)
    ? (value as RecordValue)["children"] as RecordValue[] : null;
}

function textBlock(value: RecordValue): boolean {
  return value["type"] === "breditor/paragraph" || value["type"] === "breditor/heading";
}

/** Enumerates a validated flat tree only, retaining real block paths. */
function blocks(roots: readonly RecordValue[]): BlockEntry[] {
  const result: BlockEntry[] = [];
  roots.forEach((root, index) => {
    if (textBlock(root)) result.push({ path: [index], block: root });
    else (root["children"] as RecordValue[]).forEach((item, itemIndex) =>
      result.push({ path: [index, itemIndex, 0], block: (item["children"] as RecordValue[])[0]! }));
  });
  return result;
}

function findBlock(entries: readonly BlockEntry[], path: readonly number[], guardStart: number): BlockEntry | undefined {
  return entries.find(entry => entry.path.length === path.length &&
    entry.path.every((index, depth) => index === (depth === 0 ? path[depth]! - guardStart : path[depth])));
}

function blockPath(value: unknown): value is number[] {
  return Array.isArray(value) && (value.length === 1 || (value.length === 3 && value[2] === 0)) && value.every(childIndex);
}

function boundary(value: unknown): { block: number[]; offset: number } | null {
  const record = exactJsonRecord(value, ["block", "offset"]);
  return record !== null && blockPath(record["block"]) && offset(record["offset"])
    ? { block: record["block"], offset: record["offset"] } : null;
}

function offset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function childIndex(value: unknown): value is number { return offset(value) && value < MAX_CHILDREN; }

/** Aggregate UTF-16 offsets may not split a scalar or exceed guarded text. */
function scalarBoundary(block: RecordValue, offset: number): boolean {
  let remaining = offset;
  for (const run of block["children"] as RecordValue[]) {
    const text = run["text"] as string;
    if (remaining <= text.length) {
      return remaining === 0 || remaining === text.length ||
        !(text.charCodeAt(remaining - 1) >= 0xd800 && text.charCodeAt(remaining - 1) <= 0xdbff &&
          text.charCodeAt(remaining) >= 0xdc00 && text.charCodeAt(remaining) <= 0xdfff);
    }
    remaining -= text.length;
  }
  return remaining === 0;
}

/** Compare all text-block semantics after canonical wire-record validation. */
function blockSignature(block: RecordValue): string {
  return JSON.stringify([block["type"], block["properties"], (block["children"] as RecordValue[]).map(run =>
    [run["text"], (run["formats"] as RecordValue[]).map(format => [format["type"], format["properties"]])])]);
}
