import type { AstPath } from "./ast_path.js";
import { type BaseDocumentProjection, isOwnedProjection } from "./projection.js";
import {
  BaseRangeSelection,
  type BaseEditorSelection,
  type BaseRangeOrder,
  type BaseSelectionPoint,
  type SelectionAffinity,
  isOwnedBaseRangeSelection,
} from "./selection.js";
import type { BrowserSelectionResult } from "./selection_result.js";
import { selectionFailure, selectionSuccess } from "./selection_result.js";

/** Point kinds exposed by the scalar Wasm selection boundary. */
export type SemanticSelectionPointKind = "text" | "children";

/**
 * Dependency-free structural view of one owned Wasm semantic selection.
 *
 * Node indexes address the same generic flattened preorder tree consumed by
 * the projection adapter. The view is consumed and freed on every path.
 */
export interface SemanticSelectionView {
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  readonly kind: "none" | "range";
  readonly anchorPointKind: SemanticSelectionPointKind | undefined;
  readonly anchorNodeIndex: number | undefined;
  readonly anchorOffset: number | undefined;
  readonly anchorAffinity: SelectionAffinity | undefined;
  readonly focusPointKind: SemanticSelectionPointKind | undefined;
  readonly focusNodeIndex: number | undefined;
  readonly focusOffset: number | undefined;
  readonly focusAffinity: SelectionAffinity | undefined;
  readonly rangeOrder: BaseRangeOrder | undefined;
  free(): void;
}

/** Exact scalar arguments accepted by Wasm `setRangeSelection`. */
export interface SemanticRangeSelectionScalars {
  readonly anchorPointKind: SemanticSelectionPointKind;
  readonly anchorNodeIndex: number;
  readonly anchorOffset: number;
  readonly anchorAffinity: SelectionAffinity;
  readonly focusPointKind: SemanticSelectionPointKind;
  readonly focusNodeIndex: number;
  readonly focusOffset: number;
  readonly focusAffinity: SelectionAffinity;
}

interface ReadPoint {
  readonly kind: SemanticSelectionPointKind;
  readonly nodeIndex: number;
  readonly offset: number;
  readonly affinity: SelectionAffinity;
}

/**
 * Consumes a Wasm selection view against the exact projection it references.
 *
 * Snapshot identity, node kind/index, endpoint validity, direction, and every
 * range-only optional field are rechecked before a browser value is returned.
 */
export function consumeSemanticSelection(
  projection: BaseDocumentProjection,
  view: SemanticSelectionView,
): BrowserSelectionResult<BaseEditorSelection> {
  let result: BrowserSelectionResult<BaseEditorSelection> = selectionFailure(
    "selection.invalid_wasm_view",
  );
  try {
    result = isOwnedProjection(projection)
      ? readSemanticSelection(projection, view)
      : selectionFailure("selection.invalid_wasm_view");
  } catch {
    result = selectionFailure("selection.invalid_wasm_view");
  } finally {
    try {
      view.free();
    } catch {
      result = selectionFailure("selection.invalid_wasm_view");
    }
  }
  return result;
}

/**
 * Converts one owned browser range back to exact flattened Wasm scalar fields.
 *
 * The result intentionally excludes observation authority and does not call the
 * engine. Callers pass these fields to `setRangeSelection` with a fresh guarded
 * observation, or call `clearSelection` for semantic absence.
 */
export function semanticRangeSelectionScalars(
  selection: BaseRangeSelection,
): BrowserSelectionResult<SemanticRangeSelectionScalars> {
  if (!isOwnedBaseRangeSelection(selection)) {
    return selectionFailure("selection.invalid_shape");
  }
  try {
    const anchorNodeIndex = preorderIndexForPoint(selection.projection, selection.anchor);
    const focusNodeIndex = preorderIndexForPoint(selection.projection, selection.focus);
    if (anchorNodeIndex === null || focusNodeIndex === null) {
      return selectionFailure("selection.invalid_point");
    }
    return selectionSuccess(
      Object.freeze({
        anchorPointKind: selection.anchor.kind,
        anchorNodeIndex,
        anchorOffset:
          selection.anchor.kind === "text"
            ? selection.anchor.utf16Offset
            : selection.anchor.childIndex,
        anchorAffinity: selection.anchor.affinity,
        focusPointKind: selection.focus.kind,
        focusNodeIndex,
        focusOffset:
          selection.focus.kind === "text"
            ? selection.focus.utf16Offset
            : selection.focus.childIndex,
        focusAffinity: selection.focus.affinity,
      }),
    );
  } catch {
    return selectionFailure("selection.invalid_shape");
  }
}

function readSemanticSelection(
  projection: BaseDocumentProjection,
  view: SemanticSelectionView,
): BrowserSelectionResult<BaseEditorSelection> {
  if (!isSemanticSelectionView(view)) {
    return selectionFailure("selection.invalid_wasm_view");
  }
  const snapshotLineage = view.snapshotLineage;
  const snapshotRevision = view.snapshotRevision;
  const kind = view.kind;
  const anchorPointKind = view.anchorPointKind;
  const anchorNodeIndex = view.anchorNodeIndex;
  const anchorOffset = view.anchorOffset;
  const anchorAffinity = view.anchorAffinity;
  const focusPointKind = view.focusPointKind;
  const focusNodeIndex = view.focusNodeIndex;
  const focusOffset = view.focusOffset;
  const focusAffinity = view.focusAffinity;
  const rangeOrder = view.rangeOrder;

  if (
    snapshotLineage !== projection.snapshot.lineage ||
    snapshotRevision !== projection.snapshot.revision
  ) {
    return selectionFailure("selection.snapshot_mismatch");
  }

  if (kind === "none") {
    if (
      anchorPointKind !== undefined ||
      anchorNodeIndex !== undefined ||
      anchorOffset !== undefined ||
      anchorAffinity !== undefined ||
      focusPointKind !== undefined ||
      focusNodeIndex !== undefined ||
      focusOffset !== undefined ||
      focusAffinity !== undefined ||
      rangeOrder !== undefined
    ) {
      return selectionFailure("selection.invalid_wasm_view");
    }
    return selectionSuccess(null);
  }
  if (kind !== "range" || !isRangeOrder(rangeOrder)) {
    return selectionFailure("selection.invalid_wasm_view");
  }

  const anchor = readPoint(
    anchorPointKind,
    anchorNodeIndex,
    anchorOffset,
    anchorAffinity,
  );
  const focus = readPoint(focusPointKind, focusNodeIndex, focusOffset, focusAffinity);
  if (anchor === null || focus === null) {
    return selectionFailure("selection.invalid_wasm_view");
  }
  const anchorInput = pointInputAtPreorderIndex(projection, anchor);
  const focusInput = pointInputAtPreorderIndex(projection, focus);
  if (anchorInput === null || focusInput === null) {
    return selectionFailure("selection.invalid_wasm_view");
  }
  const selection = BaseRangeSelection.create(projection, {
    kind: "range",
    anchor: anchorInput,
    focus: focusInput,
  });
  if (!selection.ok || selection.value.order !== rangeOrder) {
    return selectionFailure("selection.invalid_wasm_view");
  }
  return selection;
}

function readPoint(
  kind: unknown,
  nodeIndex: unknown,
  offset: unknown,
  affinity: unknown,
): ReadPoint | null {
  if (
    (kind !== "text" && kind !== "children") ||
    !isU32(nodeIndex) ||
    !isU32(offset) ||
    (affinity !== "before" && affinity !== "after")
  ) {
    return null;
  }
  return { kind, nodeIndex, offset, affinity };
}

function pointInputAtPreorderIndex(
  projection: BaseDocumentProjection,
  point: ReadPoint,
): Readonly<Record<string, unknown>> | null {
  const path = pathAtPreorderIndex(projection, point.nodeIndex, point.kind);
  if (path === null) {
    return null;
  }
  return point.kind === "text"
    ? Object.freeze({
        kind: "text",
        textPath: path,
        utf16Offset: point.offset,
        affinity: point.affinity,
      })
    : Object.freeze({
        kind: "children",
        parentPath: path,
        childIndex: point.offset,
        affinity: point.affinity,
      });
}

function pathAtPreorderIndex(
  projection: BaseDocumentProjection,
  requestedIndex: number,
  expectedKind: SemanticSelectionPointKind,
): AstPath | null {
  let nodeIndex = 1;
  for (let paragraphIndex = 0; paragraphIndex < projection.paragraphs.length; paragraphIndex += 1) {
    const paragraph = projection.paragraphs[paragraphIndex];
    if (paragraph === undefined) {
      return null;
    }
    if (requestedIndex === nodeIndex) {
      return expectedKind === "children" ? Object.freeze([paragraphIndex]) : null;
    }
    nodeIndex += 1;
    for (let runIndex = 0; runIndex < paragraph.runs.length; runIndex += 1) {
      if (requestedIndex === nodeIndex) {
        return expectedKind === "text" ? Object.freeze([paragraphIndex, runIndex]) : null;
      }
      nodeIndex += 1;
    }
  }
  return null;
}

function preorderIndexForPoint(
  projection: BaseDocumentProjection,
  point: BaseSelectionPoint,
): number | null {
  const path = point.kind === "text" ? point.textPath : point.parentPath;
  const targetParagraph = path[0];
  if (targetParagraph === undefined) {
    return null;
  }
  let nodeIndex = 1;
  for (let paragraphIndex = 0; paragraphIndex < projection.paragraphs.length; paragraphIndex += 1) {
    const paragraph = projection.paragraphs[paragraphIndex];
    if (paragraph === undefined) {
      return null;
    }
    if (paragraphIndex === targetParagraph) {
      if (point.kind === "children") {
        return nodeIndex;
      }
      const runIndex = path[1];
      return runIndex === undefined || runIndex >= paragraph.runs.length
        ? null
        : nodeIndex + 1 + runIndex;
    }
    nodeIndex += 1 + paragraph.runs.length;
  }
  return null;
}

function isSemanticSelectionView(view: unknown): view is SemanticSelectionView {
  if (typeof view !== "object" || view === null) {
    return false;
  }
  try {
    return typeof (view as { free?: unknown }).free === "function";
  } catch {
    return false;
  }
}

function isRangeOrder(value: unknown): value is BaseRangeOrder {
  return value === "collapsed" || value === "forward" || value === "backward";
}

function isU32(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 4_294_967_295;
}
