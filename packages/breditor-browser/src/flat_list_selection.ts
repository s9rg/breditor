import { astPathsEqual, type AstPath } from "./ast_path.js";
import { isOwnedFlatListProjection, type FlatListDocumentProjection } from "./flat_list_projection.js";
import { exactDataRecord, readExactBoundedArray, type BaseParagraphProjection } from "./projection.js";
import { isUnicodeScalarBoundary, type BaseRangeOrder, type BaseSelectionPoint } from "./selection.js";
import { selectionFailure, selectionSuccess, type BrowserSelectionResult } from "./selection_result.js";

const TOKEN = Symbol("FlatListRangeSelection construction");
const OWNED = new WeakSet<FlatListRangeSelection>();

/** Exact directional endpoints bound to one hierarchical projection snapshot. */
export class FlatListRangeSelection {
  readonly kind = "range" as const;
  private constructor(token: symbol, readonly projection: FlatListDocumentProjection,
    readonly anchor: BaseSelectionPoint, readonly focus: BaseSelectionPoint, readonly order: BaseRangeOrder) {
    if (token !== TOKEN) throw new TypeError("Use FlatListRangeSelection.create().");
    OWNED.add(this);
    Object.freeze(this);
  }

  static create(projection: FlatListDocumentProjection, input: unknown): BrowserSelectionResult<FlatListRangeSelection> {
    try {
      if (!isOwnedFlatListProjection(projection)) return selectionFailure("selection.invalid_shape");
      const record = exactDataRecord(input, ["kind", "anchor", "focus"]);
      if (record === null || record["kind"] !== "range") return selectionFailure("selection.invalid_shape");
      const anchor = validateFlatListSelectionPoint(projection, record["anchor"]);
      if (!anchor.ok) return anchor;
      const focus = validateFlatListSelectionPoint(projection, record["focus"]);
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
      return selectionSuccess(new FlatListRangeSelection(TOKEN, projection, anchor.value, focus.value,
        comparison === 0 ? "collapsed" : comparison < 0 ? "forward" : "backward"));
    } catch { return selectionFailure("selection.invalid_shape"); }
  }
}

/** @internal */
export function isOwnedFlatListRangeSelection(value: unknown): value is FlatListRangeSelection {
  return typeof value === "object" && value !== null && OWNED.has(value as FlatListRangeSelection);
}

/** Constant-depth lookup; list wrappers themselves are not text containers. @internal */
export function flatListBlockAtPath(projection: FlatListDocumentProjection, path: AstPath): BaseParagraphProjection | undefined {
  const root = path[0] === undefined ? undefined : projection.blocks[path[0]];
  if (root === undefined) return undefined;
  if (root.kind === "textBlock") return path.length === 1 ? root.block : undefined;
  return path.length === 3 && path[2] === 0 && path[1] !== undefined ? root.items[path[1]] : undefined;
}

/** Own-data paths, scalar UTF-16 boundaries and exact text-container topology. @internal */
export function validateFlatListSelectionPoint(projection: FlatListDocumentProjection, input: unknown): BrowserSelectionResult<BaseSelectionPoint> {
  try {
    if (!isOwnedFlatListProjection(projection)) return selectionFailure("selection.invalid_shape");
    const text = exactDataRecord(input, ["kind", "textPath", "utf16Offset", "affinity"]);
    const record = text ?? exactDataRecord(input, ["kind", "parentPath", "childIndex", "affinity"]);
    if (record === null || (text !== null ? record["kind"] !== "text" : record["kind"] !== "children") ||
      (record["affinity"] !== "before" && record["affinity"] !== "after")) return selectionFailure("selection.invalid_shape");
    const array = readExactBoundedArray(record[text !== null ? "textPath" : "parentPath"], 4);
    const offset = record[text !== null ? "utf16Offset" : "childIndex"];
    const u32 = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 4_294_967_295;
    if (!array.ok || !array.values.every(u32) || !u32(offset)) return selectionFailure("selection.invalid_shape");
    const path = Object.freeze(array.values as number[]);
    const blockPath = text === null ? path : path.slice(0, -1);
    const block = flatListBlockAtPath(projection, blockPath);
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

function spatial(projection: FlatListDocumentProjection, point: BaseSelectionPoint): {path: AstPath; offset: number} {
  const path = point.kind === "text" ? point.textPath.slice(0, -1) : point.parentPath;
  const block = flatListBlockAtPath(projection, path)!; // Both endpoints have just been validated.
  const boundary = point.kind === "text" ? point.textPath[point.textPath.length - 1]! : point.childIndex;
  const prefix = block.runs.slice(0, boundary).reduce((sum, run) => sum + run.text.length, 0);
  return {path, offset: prefix + (point.kind === "text" ? point.utf16Offset : 0)};
}

/** Scalar-checked aggregate offset in the actual hierarchical text block. @internal */
export function flatListSpatialPositionForPoint(projection: FlatListDocumentProjection, point: unknown):
  Readonly<{textBlockPath: AstPath; utf16Offset: number}> | null {
  const checked = validateFlatListSelectionPoint(projection, point);
  if (!checked.ok) return null;
  const position = spatial(projection, checked.value);
  return Object.freeze({textBlockPath: Object.freeze([...position.path]), utf16Offset: position.offset});
}
