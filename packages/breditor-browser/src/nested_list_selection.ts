import { astPathsEqual, type AstPath } from "./ast_path.js";
import { isOwnedNestedListProjection, type NestedListDocumentProjection, type NestedListContainerProjection, type NestedListItemProjection } from "./nested_list_projection.js";
import { exactDataRecord, readExactBoundedArray, type BaseParagraphProjection } from "./projection.js";
import { isUnicodeScalarBoundary, type BaseRangeOrder, type BaseSelectionPoint } from "./selection.js";
import { selectionFailure, selectionSuccess, type BrowserSelectionResult } from "./selection_result.js";

const TOKEN = Symbol("NestedListRangeSelection construction");
const OWNED = new WeakSet<NestedListRangeSelection>();

/** Exact directional endpoints bound to one hierarchical projection snapshot. */
export class NestedListRangeSelection {
  readonly kind = "range" as const;
  private constructor(token: symbol, readonly projection: NestedListDocumentProjection,
    readonly anchor: BaseSelectionPoint, readonly focus: BaseSelectionPoint, readonly order: BaseRangeOrder) {
    if (token !== TOKEN) throw new TypeError("Use NestedListRangeSelection.create().");
    OWNED.add(this);
    Object.freeze(this);
  }

  static create(projection: NestedListDocumentProjection, input: unknown): BrowserSelectionResult<NestedListRangeSelection> {
    try {
      if (!isOwnedNestedListProjection(projection)) return selectionFailure("selection.invalid_shape");
      const record = exactDataRecord(input, ["kind", "anchor", "focus"]);
      if (record === null || record["kind"] !== "range") return selectionFailure("selection.invalid_shape");
      const anchor = validateNestedListSelectionPoint(projection, record["anchor"]);
      if (!anchor.ok) return anchor;
      const focus = validateNestedListSelectionPoint(projection, record["focus"]);
      if (!focus.ok) return focus;
      const a = spatial(projection, anchor.value);
      const f = spatial(projection, focus.value);
      let comparison = 0;
      if (astPathsEqual(a.path, f.path)) comparison = a.offset - f.offset;
      else {
        for (let i = 0; i < Math.max(a.path.length, f.path.length); i += 1) {
          comparison = (a.path[i] ?? -1) - (f.path[i] ?? -1);
          if (comparison !== 0) break;
        }
      }
      return selectionSuccess(new NestedListRangeSelection(TOKEN, projection, anchor.value, focus.value,
        comparison === 0 ? "collapsed" : comparison < 0 ? "forward" : "backward"));
    } catch { return selectionFailure("selection.invalid_shape"); }
  }
}

/** @internal */
export function isOwnedNestedListRangeSelection(value: unknown): value is NestedListRangeSelection {
  return typeof value === "object" && value !== null && OWNED.has(value as NestedListRangeSelection);
}

/** Bounded path traversal; list/item wrappers are never text containers. @internal */
export function nestedListBlockAtPath(projection: NestedListDocumentProjection, path: AstPath): BaseParagraphProjection | undefined {
  if (path.length > 63) return undefined;
  const root = path[0] === undefined ? undefined : projection.blocks[path[0]];
  if (root === undefined) return undefined;
  if (root.kind === "textBlock") return path.length === 1 ? root.block : undefined;
  let node: NestedListContainerProjection = root;
  for (let cursor = 1; cursor + 1 < path.length; cursor += 2) {
    const itemIndex = path[cursor]!;
    const section = path[cursor + 1]!;
    const item: NestedListItemProjection | undefined = node.items[itemIndex];
    if (item === undefined) return undefined;
    if (section === 0) return cursor + 2 === path.length ? item.block : undefined;
    const child: NestedListContainerProjection | undefined = item.lists[section - 1];
    if (child === undefined) return undefined;
    node = child;
  }
  return undefined;
}

/** Own-data paths, scalar UTF-16 boundaries and exact text-container topology. @internal */
export function validateNestedListSelectionPoint(projection: NestedListDocumentProjection, input: unknown): BrowserSelectionResult<BaseSelectionPoint> {
  try {
    if (!isOwnedNestedListProjection(projection)) return selectionFailure("selection.invalid_shape");
    const text = exactDataRecord(input, ["kind", "textPath", "utf16Offset", "affinity"]);
    const record = text ?? exactDataRecord(input, ["kind", "parentPath", "childIndex", "affinity"]);
    if (record === null || (text !== null ? record["kind"] !== "text" : record["kind"] !== "children") ||
      (record["affinity"] !== "before" && record["affinity"] !== "after")) return selectionFailure("selection.invalid_shape");
    const array = readExactBoundedArray(record[text !== null ? "textPath" : "parentPath"], 64);
    const offset = record[text !== null ? "utf16Offset" : "childIndex"];
    const u32 = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;
    if (!array.ok || !array.values.every(u32) || !u32(offset)) return selectionFailure("selection.invalid_shape");
    const path = Object.freeze(array.values as number[]);
    const blockPath = text === null ? path : path.slice(0, -1);
    const block = nestedListBlockAtPath(projection, blockPath);
    if (block === undefined) return selectionFailure("selection.invalid_point");
    if (text !== null) {
      const runIndex = path[path.length - 1];
      const run = runIndex === undefined ? undefined : block.runs[runIndex];
      if (run === undefined || offset > run.text.length) return selectionFailure("selection.invalid_point");
      if (!isUnicodeScalarBoundary(run.text, offset)) return selectionFailure("selection.invalid_utf16_boundary");
      return selectionSuccess(Object.freeze({kind: "text", textPath: path, utf16Offset: offset, affinity: record["affinity"]}));
    }
    if (offset > block.runs.length) return selectionFailure("selection.invalid_point");
    return selectionSuccess(Object.freeze({kind: "children", parentPath: path, childIndex: offset, affinity: record["affinity"]}));
  } catch { return selectionFailure("selection.invalid_shape"); }
}

function spatial(projection: NestedListDocumentProjection, point: BaseSelectionPoint): {path: AstPath; offset: number} {
  const path = point.kind === "text" ? point.textPath.slice(0, -1) : point.parentPath;
  const block = nestedListBlockAtPath(projection, path)!; // Both endpoints have just been validated.
  const boundary = point.kind === "text" ? point.textPath[point.textPath.length - 1]! : point.childIndex;
  const prefix = block.runs.slice(0, boundary).reduce((sum, run) => sum + run.text.length, 0);
  return {path, offset: prefix + (point.kind === "text" ? point.utf16Offset : 0)};
}

/** Scalar-checked aggregate offset in the actual hierarchical text block. @internal */
export function nestedListSpatialPositionForPoint(projection: NestedListDocumentProjection, point: unknown):
  Readonly<{textBlockPath: AstPath; utf16Offset: number}> | null {
  const checked = validateNestedListSelectionPoint(projection, point);
  if (!checked.ok) return null;
  const position = spatial(projection, checked.value);
  return Object.freeze({textBlockPath: Object.freeze([...position.path]), utf16Offset: position.offset});
}
