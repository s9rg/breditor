import { BaseDocumentProjection, type BaseDocumentProjectionInput } from "./projection.js";
import { BaseProjectionUpdate, type BaseProjectionImpact } from "./projection_update.js";
import type { BrowserProjectionResult } from "./result.js";
import { projectionFailure } from "./result.js";

/**
 * Dependency-free structural view of the flattened semantic Wasm projection.
 *
 * Generated Wasm classes satisfy this contract without becoming a package
 * dependency. The view is owned and consumed by this adapter.
 */
export interface SemanticProjectionView {
  /** Validated schema name. */
  readonly schemaName: string;
  /** Validated schema version. */
  readonly schemaVersion: number;
  /** Snapshot lineage. */
  readonly snapshotLineage: string;
  /** Canonical unsigned-decimal snapshot revision. */
  readonly snapshotRevision: string;
  /** Number of entries in the flattened preorder node array. */
  readonly nodeCount: number;
  /** Root entry index. */
  readonly rootIndex: number;
  /** Returns an entry's semantic kind. */
  nodeKind(index: number): "element" | "text" | undefined;
  /** Returns an element's qualified type, or `undefined` for text. */
  elementType(index: number): string | undefined;
  /** Returns an element child count, or `undefined` for text. */
  childCount(index: number): number | undefined;
  /** Returns one element child's flattened index. */
  childAt(index: number, ordinal: number): number | undefined;
  /** Returns a text leaf's contents, or `undefined` for elements. */
  text(index: number): string | undefined;
  /** Returns a text leaf's format count, or `undefined` for elements. */
  formatCount(index: number): number | undefined;
  /** Returns one text format's qualified type. */
  formatType(index: number, ordinal: number): string | undefined;
  /** Releases the consumed Wasm handle. */
  free(): void;
}

/** Semantic invalidation kinds exposed by the Wasm projection update. */
export type SemanticProjectionImpact = "none" | "textContainers" | "rootSplice" | "root";

/**
 * Dependency-free structural view of one owned Wasm projection update.
 *
 * The result projection can be taken exactly once. This adapter consumes both
 * the update and its taken result projection.
 */
export interface SemanticProjectionUpdateView {
  /** Expected base lineage. */
  readonly baseLineage: string;
  /** Expected base revision. */
  readonly baseRevision: string;
  /** Result lineage. */
  readonly resultLineage: string;
  /** Result revision. */
  readonly resultRevision: string;
  /** Core-derived invalidation kind. */
  readonly impact: SemanticProjectionImpact;
  /** Number of exact paragraph indexes for `textContainers`. */
  readonly affectedParagraphCount: number;
  /** Old half-open root child range start for `rootSplice`. */
  readonly oldChildStart: number | undefined;
  /** Old half-open root child range end for `rootSplice`. */
  readonly oldChildEnd: number | undefined;
  /** New half-open root child range start for `rootSplice`. */
  readonly newChildStart: number | undefined;
  /** New half-open root child range end for `rootSplice`. */
  readonly newChildEnd: number | undefined;
  /** Returns one affected paragraph index. */
  affectedParagraphIndex(index: number): number | undefined;
  /** Takes the exact result projection once. */
  takeProjection(): SemanticProjectionView | undefined;
  /** Releases the consumed Wasm handle. */
  free(): void;
}

/**
 * Consumes a flattened Wasm semantic view into an owned base projection.
 *
 * The flattened tree must be exact preorder base-schema structure. The view is
 * freed on every path, including malformed raw-JavaScript inputs.
 */
export function consumeSemanticProjection(
  view: SemanticProjectionView,
): BrowserProjectionResult<BaseDocumentProjection> {
  let result: BrowserProjectionResult<BaseDocumentProjection> = projectionFailure(
    "projection.invalid_shape",
  );
  try {
    result = readSemanticProjection(view);
  } catch {
    result = projectionFailure("projection.invalid_shape");
  } finally {
    try {
      view.free();
    } catch {
      result = projectionFailure("projection.invalid_shape");
    }
  }
  return result;
}

/**
 * Consumes a Wasm update against one exact owned browser projection.
 *
 * The adapter verifies duplicated base/result snapshot fields, maps the closed
 * impact enum, takes and consumes the result projection, and then lets
 * {@link BaseProjectionUpdate.create} prove every claimed reusable paragraph.
 * Owning adapters may supply outer generated handles as identity-only guards;
 * a nested alias is rejected without reading or freeing the protected owner.
 */
export function consumeSemanticProjectionUpdate(
  base: BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  protectedHandles: readonly unknown[] = [],
): BrowserProjectionResult<BaseProjectionUpdate> {
  let result: BrowserProjectionResult<BaseProjectionUpdate> = projectionFailure(
    "projection.invalid_update",
  );
  try {
    result = readSemanticProjectionUpdate(base, view, protectedHandles);
  } catch {
    result = projectionFailure("projection.invalid_update");
  } finally {
    try {
      view.free();
    } catch {
      result = projectionFailure("projection.invalid_update");
    }
  }
  return result;
}

function readSemanticProjection(
  view: SemanticProjectionView,
): BrowserProjectionResult<BaseDocumentProjection> {
  if (!isSemanticProjectionView(view)) {
    return projectionFailure("projection.invalid_shape");
  }
  const schemaName = view.schemaName;
  const schemaVersion = view.schemaVersion;
  const snapshotLineage = view.snapshotLineage;
  const snapshotRevision = view.snapshotRevision;
  const nodeCount = view.nodeCount;
  const rootIndex = view.rootIndex;
  if (
    schemaName !== "breditor/base" ||
    schemaVersion !== 1 ||
    !isIndex(nodeCount) ||
    nodeCount < 2 ||
    nodeCount > 100_000 ||
    rootIndex !== 0 ||
    view.nodeKind(0) !== "element" ||
    view.elementType(0) !== "breditor/document" ||
    view.text(0) !== undefined ||
    view.formatCount(0) !== undefined ||
    view.formatType(0, 0) !== undefined
  ) {
    return projectionFailure("projection.invalid_shape");
  }
  const paragraphCount = view.childCount(0);
  if (
    paragraphCount === undefined ||
    !isIndex(paragraphCount) ||
    paragraphCount === 0 ||
    paragraphCount > 10_000
  ) {
    return projectionFailure("projection.invalid_shape");
  }

  const paragraphs: Array<{ runs: Array<{ text: string; strong: boolean }> }> = [];
  let expectedIndex = 1;
  for (let paragraphOrdinal = 0; paragraphOrdinal < paragraphCount; paragraphOrdinal += 1) {
    const paragraphIndex = view.childAt(0, paragraphOrdinal);
    if (
      paragraphIndex !== expectedIndex ||
      view.nodeKind(paragraphIndex) !== "element" ||
      view.elementType(paragraphIndex) !== "breditor/paragraph" ||
      view.text(paragraphIndex) !== undefined ||
      view.formatCount(paragraphIndex) !== undefined ||
      view.formatType(paragraphIndex, 0) !== undefined
    ) {
      return projectionFailure("projection.invalid_shape");
    }
    expectedIndex += 1;
    const runCount = view.childCount(paragraphIndex);
    if (runCount === undefined || !isIndex(runCount) || runCount > 10_000) {
      return projectionFailure("projection.invalid_shape");
    }
    const runs: Array<{ text: string; strong: boolean }> = [];
    for (let runOrdinal = 0; runOrdinal < runCount; runOrdinal += 1) {
      const runIndex = view.childAt(paragraphIndex, runOrdinal);
      if (
        runIndex !== expectedIndex ||
        view.nodeKind(runIndex) !== "text" ||
        view.elementType(runIndex) !== undefined ||
        view.childCount(runIndex) !== undefined ||
        view.childAt(runIndex, 0) !== undefined
      ) {
        return projectionFailure("projection.invalid_shape");
      }
      expectedIndex += 1;
      const text = view.text(runIndex);
      const formatCount = view.formatCount(runIndex);
      if (
        typeof text !== "string" ||
        formatCount === undefined ||
        !isIndex(formatCount) ||
        formatCount > 1
      ) {
        return projectionFailure("projection.invalid_shape");
      }
      const strong = formatCount === 1;
      if (strong && view.formatType(runIndex, 0) !== "breditor/strong") {
        return projectionFailure("projection.invalid_shape");
      }
      if (!strong && view.formatType(runIndex, 0) !== undefined) {
        return projectionFailure("projection.invalid_shape");
      }
      if (view.formatType(runIndex, formatCount) !== undefined) {
        return projectionFailure("projection.invalid_shape");
      }
      runs.push({ text, strong });
    }
    if (view.childAt(paragraphIndex, runCount) !== undefined) {
      return projectionFailure("projection.invalid_shape");
    }
    paragraphs.push({ runs });
  }
  if (
    expectedIndex !== nodeCount ||
    view.childAt(0, paragraphCount) !== undefined ||
    view.nodeKind(nodeCount) !== undefined ||
    view.elementType(nodeCount) !== undefined ||
    view.childCount(nodeCount) !== undefined ||
    view.childAt(nodeCount, 0) !== undefined ||
    view.text(nodeCount) !== undefined ||
    view.formatCount(nodeCount) !== undefined ||
    view.formatType(nodeCount, 0) !== undefined
  ) {
    return projectionFailure("projection.invalid_shape");
  }

  const input: BaseDocumentProjectionInput = {
    schema: { name: schemaName, version: schemaVersion },
    snapshot: { lineage: snapshotLineage, revision: snapshotRevision },
    paragraphs,
  };
  return BaseDocumentProjection.create(input);
}

function readSemanticProjectionUpdate(
  base: BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  protectedHandles: readonly unknown[],
): BrowserProjectionResult<BaseProjectionUpdate> {
  if (
    !isSemanticProjectionUpdateView(view) ||
    view.baseLineage !== base.snapshot.lineage ||
    view.baseRevision !== base.snapshot.revision ||
    !isIndex(view.affectedParagraphCount) ||
    view.affectedParagraphCount > 10_000
  ) {
    return projectionFailure("projection.invalid_update");
  }
  const impact = readSemanticImpact(view);
  if (impact === null) {
    return projectionFailure("projection.invalid_update");
  }
  const resultView = view.takeProjection();
  if (resultView === undefined) {
    return projectionFailure("projection.invalid_update");
  }
  // `takeProjection` crosses a second generated-handle boundary. A hostile or
  // corrupted wrapper must not smuggle an outer owner into the projection
  // consumer, whose normal contract is to free the value it receives.
  if (
    (resultView as unknown) === view ||
    protectedHandles.some((handle) => resultView === handle)
  ) {
    return projectionFailure("projection.invalid_update");
  }
  const projectionResult = consumeSemanticProjection(resultView);
  if (!projectionResult.ok) {
    return projectionFailure("projection.invalid_update");
  }
  const projection = projectionResult.value;
  if (
    projection.snapshot.lineage !== view.resultLineage ||
    projection.snapshot.revision !== view.resultRevision
  ) {
    return projectionFailure("projection.invalid_update");
  }
  return BaseProjectionUpdate.create({ base, result: projection, impact });
}

function readSemanticImpact(view: SemanticProjectionUpdateView): BaseProjectionImpact | null {
  switch (view.impact) {
    case "none":
      return noRangesAndNoParagraphs(view) ? { kind: "none" } : null;
    case "textContainers": {
      if (!rangesAbsent(view) || view.affectedParagraphCount === 0) {
        return null;
      }
      const paragraphIndexes: number[] = [];
      for (let ordinal = 0; ordinal < view.affectedParagraphCount; ordinal += 1) {
        const paragraphIndex = view.affectedParagraphIndex(ordinal);
        if (paragraphIndex === undefined || !isIndex(paragraphIndex)) {
          return null;
        }
        paragraphIndexes.push(paragraphIndex);
      }
      if (view.affectedParagraphIndex(view.affectedParagraphCount) !== undefined) {
        return null;
      }
      return { kind: "textContainers", paragraphIndexes };
    }
    case "rootSplice": {
      if (view.affectedParagraphCount !== 0 || view.affectedParagraphIndex(0) !== undefined) {
        return null;
      }
      const { oldChildStart, oldChildEnd, newChildStart, newChildEnd } = view;
      if (
        oldChildStart === undefined ||
        oldChildEnd === undefined ||
        newChildStart === undefined ||
        newChildEnd === undefined
      ) {
        return null;
      }
      return {
        kind: "rootSplice",
        oldRange: { start: oldChildStart, end: oldChildEnd },
        newRange: { start: newChildStart, end: newChildEnd },
      };
    }
    case "root":
      return noRangesAndNoParagraphs(view) ? { kind: "root" } : null;
    default:
      return null;
  }
}

function noRangesAndNoParagraphs(view: SemanticProjectionUpdateView): boolean {
  return (
    view.affectedParagraphCount === 0 &&
    view.affectedParagraphIndex(0) === undefined &&
    rangesAbsent(view)
  );
}

function rangesAbsent(view: SemanticProjectionUpdateView): boolean {
  return (
    view.oldChildStart === undefined &&
    view.oldChildEnd === undefined &&
    view.newChildStart === undefined &&
    view.newChildEnd === undefined
  );
}

function isIndex(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSemanticProjectionView(view: SemanticProjectionView): boolean {
  return (
    typeof view === "object" &&
    view !== null &&
    typeof view.nodeKind === "function" &&
    typeof view.elementType === "function" &&
    typeof view.childCount === "function" &&
    typeof view.childAt === "function" &&
    typeof view.text === "function" &&
    typeof view.formatCount === "function" &&
    typeof view.formatType === "function" &&
    typeof view.free === "function"
  );
}

function isSemanticProjectionUpdateView(view: SemanticProjectionUpdateView): boolean {
  return (
    typeof view === "object" &&
    view !== null &&
    typeof view.affectedParagraphIndex === "function" &&
    typeof view.takeProjection === "function" &&
    typeof view.free === "function"
  );
}
