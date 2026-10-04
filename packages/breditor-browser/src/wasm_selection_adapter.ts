import type { AstPath } from "./ast_path.js";
import { astPathsEqual } from "./ast_path.js";
import { flatListProjectionMatchesProfileGeneration, isOwnedFlatListProjection, type FlatListDocumentProjection } from "./flat_list_projection.js";
import { FlatListRangeSelection, isOwnedFlatListRangeSelection } from "./flat_list_selection.js";
import { normalizeWasmBoundaryNumber } from "./normalize_wasm_boundary_number.js";
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
import {
  projectionMatchesProfileGeneration,
} from "./wasm_projection_adapter.js";
import {
  wasmProfileGenerationIsLive,
  wasmViewMatchesProfileGeneration,
  type WasmProfileCorrelatedView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

// Capture the generated getters through one generic call site, in contract
// order. Each value remains untrusted; all existing validation runs afterward.
// Do not substitute retries or later getter reads for a rejected snapshot.
// Bounded WebKit evidence and remaining faults: docs/WEBKIT_CLIPBOARD_INVESTIGATION.md.
const selectionSnapshotFields = Object.freeze([
  "snapshotLineage", "snapshotRevision", "kind",
  "anchorPointKind", "anchorNodeIndex", "anchorOffset", "anchorAffinity",
  "focusPointKind", "focusNodeIndex", "focusOffset", "focusAffinity", "rangeOrder",
] as const);

// Claim before touching any foreign getter, including `free` and `then`.
// Nested consumers must neither inspect nor free the active owner's view.
const ACTIVE_SELECTION_CONSUMPTIONS = new WeakSet<object>();
type SelectionProjection = BaseDocumentProjection | FlatListDocumentProjection;
type EditorSelection = BaseRangeSelection | FlatListRangeSelection | null;

/** Point kinds exposed by the scalar Wasm selection boundary. */
export type SemanticSelectionPointKind = "text" | "children";

/**
 * Dependency-free structural view of one owned Wasm semantic selection.
 *
 * Node indexes address the same generic flattened preorder tree consumed by
 * the projection adapter. The view is consumed and freed on every path.
 */
export interface SemanticSelectionView extends WasmProfileCorrelatedView {
  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean;
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
  generation: WasmProfileGenerationView,
): BrowserSelectionResult<BaseEditorSelection> {
  return consumeSemanticSelectionWithCleanup(projection, view, undefined, generation);
}

/** Consumes a selection with optional cleanup captured by its outer owner. @internal */
export function consumeSemanticSelectionWithCleanup(
  projection: BaseDocumentProjection,
  view: SemanticSelectionView,
  cleanup: (() => unknown) | undefined,
  generation: WasmProfileGenerationView,
  asynchronous?: boolean,
): BrowserSelectionResult<BaseEditorSelection> {
  return consumeSelection(projection, view, cleanup, generation, asynchronous, false) as BrowserSelectionResult<BaseEditorSelection>;
}

/** Explicit list selection consumption with the same captured-read/cleanup guard. @internal */
export function consumeFlatListSemanticSelection(projection: FlatListDocumentProjection, view: SemanticSelectionView,
  generation: WasmProfileGenerationView): BrowserSelectionResult<FlatListRangeSelection | null> {
  return consumeSelection(projection, view, undefined, generation, undefined, true) as BrowserSelectionResult<FlatListRangeSelection | null>;
}

function consumeSelection(projection: SelectionProjection, view: SemanticSelectionView, cleanup: (() => unknown) | undefined,
  generation: WasmProfileGenerationView, asynchronous: boolean | undefined, flatLists: boolean): BrowserSelectionResult<EditorSelection> {
  if (((typeof view !== "object" || view === null) && typeof view !== "function") ||
      (view as unknown) === generation || ACTIVE_SELECTION_CONSUMPTIONS.has(view)) {
    return selectionFailure("selection.invalid_wasm_view");
  }
  ACTIVE_SELECTION_CONSUMPTIONS.add(view);
  try {
    const capturedCleanup = cleanup ?? snapshotGeneratedCleanup(view);
    const capturedAsynchronous = asynchronous ?? containGeneratedThenable(view);
    if (capturedCleanup === null) return selectionFailure("selection.invalid_wasm_view");
    let result: BrowserSelectionResult<EditorSelection> = selectionFailure(
      "selection.invalid_wasm_view",
    );
    try {
      result = !capturedAsynchronous &&
        (flatLists ? isOwnedFlatListProjection(projection) : isOwnedProjection(projection)) &&
        wasmProfileGenerationIsLive(generation) &&
        (isOwnedFlatListProjection(projection) ? flatListProjectionMatchesProfileGeneration(projection, generation) : projectionMatchesProfileGeneration(projection, generation)) &&
        wasmViewMatchesProfileGeneration(view, generation)
        ? readSemanticSelection(projection, view)
        : selectionFailure("selection.invalid_wasm_view");
    } catch {
      result = selectionFailure("selection.invalid_wasm_view");
    } finally {
      if (!runGeneratedCleanup(capturedCleanup)) {
        result = selectionFailure("selection.invalid_wasm_view");
      }
    }
    // Generated reads and cleanup can invalidate the caller-owned generation.
    return result.ok && !wasmProfileGenerationIsLive(generation)
      ? selectionFailure("selection.invalid_wasm_view")
      : result;
  } finally {
    ACTIVE_SELECTION_CONSUMPTIONS.delete(view);
  }
}

function runGeneratedCleanup(cleanup: () => unknown): boolean {
  try {
    const returned = cleanup();
    if (returned === undefined) return true;
    containGeneratedSettlement(returned);
    return false;
  } catch {
    return false;
  }
}

/** Called only after the guarded entry has proved object identity. */
function snapshotGeneratedCleanup(value: SemanticSelectionView): (() => unknown) | null {
  try {
    const free = (value as { free?: unknown }).free;
    if (typeof free !== "function") return null;
    const receiver = value;
    return () => Reflect.apply(free, receiver, []) as unknown;
  } catch {
    return null;
  }
}

function containGeneratedThenable(value: unknown): boolean {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false;
  }
  let then: unknown;
  try {
    then = (value as { then?: unknown }).then;
  } catch {
    return true;
  }
  if (then === undefined) return false;
  containGeneratedSettlement(value);
  return true;
}

const GENERATED_PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const GENERATED_PROMISE_THEN = Promise.prototype.then;
const IGNORE_GENERATED_SETTLEMENT = (): undefined => undefined;

function containGeneratedSettlement(value: unknown): void {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return;
  }
  try {
    const settled = GENERATED_PROMISE_RESOLVE(value);
    Reflect.apply(GENERATED_PROMISE_THEN, settled, [
      IGNORE_GENERATED_SETTLEMENT,
      IGNORE_GENERATED_SETTLEMENT,
    ]);
  } catch {
    // The value is still rejected as an asynchronous generated handle.
  }
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
  return rangeSelectionScalars(selection);
}

/** Exact preorder indices include list and item wrappers; no engine call. @internal */
export function flatListSemanticRangeSelectionScalars(selection: FlatListRangeSelection): BrowserSelectionResult<SemanticRangeSelectionScalars> {
  return isOwnedFlatListRangeSelection(selection) ? rangeSelectionScalars(selection) : selectionFailure("selection.invalid_shape");
}

function rangeSelectionScalars(selection: BaseRangeSelection | FlatListRangeSelection): BrowserSelectionResult<SemanticRangeSelectionScalars> {
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
  projection: SelectionProjection,
  view: SemanticSelectionView,
): BrowserSelectionResult<EditorSelection> {
  if (!isSemanticSelectionView(view)) {
    return selectionFailure("selection.invalid_wasm_view");
  }
  const [
    snapshotLineage, snapshotRevision, kind,
    anchorPointKind, anchorNodeIndex, anchorOffset, anchorAffinity,
    focusPointKind, focusNodeIndex, focusOffset, focusAffinity, rangeOrder,
  ] = selectionSnapshotFields.map((field) => normalizeWasmBoundaryNumber(Reflect.get(view, field)));

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
  const input = {
    kind: "range",
    anchor: anchorInput,
    focus: focusInput,
  };
  const selection = isOwnedFlatListProjection(projection) ? FlatListRangeSelection.create(projection, input) : BaseRangeSelection.create(projection, input);
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
  projection: SelectionProjection,
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
  projection: SelectionProjection,
  requestedIndex: number,
  expectedKind: SemanticSelectionPointKind,
): AstPath | null {
  if (isOwnedFlatListProjection(projection)) {
    for (const entry of flatListSelectableNodes(projection)) {
      if (entry.index === requestedIndex) return entry.kind === expectedKind ? entry.path : null;
      if (entry.index > requestedIndex) return null;
    }
    return null;
  }
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
  projection: SelectionProjection,
  point: BaseSelectionPoint,
): number | null {
  const path = point.kind === "text" ? point.textPath : point.parentPath;
  if (isOwnedFlatListProjection(projection)) {
    for (const entry of flatListSelectableNodes(projection)) {
      if (entry.kind === point.kind && astPathsEqual(entry.path, path)) return entry.index;
    }
    return null;
  }
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

/** Traverses the validated topology, counting—but never selecting—wrappers. */
function* flatListSelectableNodes(projection: FlatListDocumentProjection): Generator<Readonly<{index: number; path: AstPath; kind: SemanticSelectionPointKind}>> {
  let index = 1;
  for (const [rootIndex, root] of projection.blocks.entries()) {
    if (root.kind !== "textBlock") index += 1;
    const blocks = root.kind === "textBlock" ? [root.block] : root.items;
    for (const [itemIndex, block] of blocks.entries()) {
      const path = root.kind === "textBlock" ? [rootIndex] : [rootIndex, itemIndex, 0];
      if (root.kind !== "textBlock") index += 1;
      yield {index: index++, path: Object.freeze(path), kind: "children"};
      for (let run = 0; run < block.runs.length; run += 1) yield {index: index++, path: Object.freeze([...path, run]), kind: "text"};
    }
  }
}

function isSemanticSelectionView(view: unknown): view is SemanticSelectionView {
  return typeof view === "object" && view !== null;
}

function isRangeOrder(value: unknown): value is BaseRangeOrder {
  return value === "collapsed" || value === "forward" || value === "backward";
}

// WebKit has intermittently misclassified a captured small integer at the
// floating u32 upper-bound comparison. Inspect the double's high word instead:
// 0x41f0 begins at 2^32, and 0x8000 is negative zero. The safe-integer guard
// rejects fractions and foreign values without input coercion. Under standard
// built-ins, the scratch writes and reads are synchronous and non-reentrant.
const __breditorSelectionU32Compact = new DataView(new ArrayBuffer(8));
function isU32(value: unknown): value is number {
  if (!Number.isSafeInteger(value)) return false;
  __breditorSelectionU32Compact.setFloat64(0, value as number, false);
  const high = __breditorSelectionU32Compact.getUint16(0, false);
  return high < 0x41f0 || high === 0x8000;
}
