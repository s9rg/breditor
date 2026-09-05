import type { AstPath } from "./ast_path.js";
import { type BaseDocumentProjection, isOwnedProjection } from "./projection.js";
import type {
  BrowserSelectionErrorCode,
  BrowserSelectionResult,
} from "./selection_result.js";
import { selectionFailure, selectionSuccess } from "./selection_result.js";

/** Which side owns content inserted at an exact selection boundary. */
export type SelectionAffinity = "before" | "after";

/** Spatial direction of a validated directional range. */
export type BaseRangeOrder = "collapsed" | "forward" | "backward";

/** A checked UTF-16 boundary in one projected text leaf. */
export interface BaseTextSelectionPoint {
  readonly kind: "text";
  readonly textPath: AstPath;
  readonly utf16Offset: number;
  readonly affinity: SelectionAffinity;
}

/** A checked child boundary inside one projected paragraph. */
export interface BaseChildrenSelectionPoint {
  readonly kind: "children";
  readonly parentPath: AstPath;
  readonly childIndex: number;
  readonly affinity: SelectionAffinity;
}

/** One endpoint accepted by the base-schema range selection. */
export type BaseSelectionPoint = BaseTextSelectionPoint | BaseChildrenSelectionPoint;

/** Input accepted by {@link BaseRangeSelection.create}. */
export interface BaseRangeSelectionInput {
  readonly kind: "range";
  readonly anchor: Readonly<
    | {
        kind: "text";
        textPath: readonly number[];
        utf16Offset: number;
        affinity: SelectionAffinity;
      }
    | {
        kind: "children";
        parentPath: readonly number[];
        childIndex: number;
        affinity: SelectionAffinity;
      }
  >;
  readonly focus: Readonly<
    | {
        kind: "text";
        textPath: readonly number[];
        utf16Offset: number;
        affinity: SelectionAffinity;
      }
    | {
        kind: "children";
        parentPath: readonly number[];
        childIndex: number;
        affinity: SelectionAffinity;
      }
  >;
}

/** Current editor selection domain; `null` is explicit semantic selection absence. */
export type BaseEditorSelection = BaseRangeSelection | null;

interface SpatialPosition {
  readonly paragraphIndex: number;
  readonly utf16Offset: number;
}

type PointValidation =
  | { readonly ok: true; readonly point: BaseSelectionPoint; readonly spatial: SpatialPosition }
  | { readonly ok: false; readonly code: BrowserSelectionErrorCode };

const MAX_U32 = 4_294_967_295;
const CONSTRUCTION_TOKEN = Symbol("BaseRangeSelection construction");
const OWNED_SELECTIONS = new WeakSet<BaseRangeSelection>();

/**
 * A validated, deeply immutable directional selection for one exact projection.
 *
 * The projection identity is intentionally retained: AST paths are snapshot-local
 * and cannot be reused merely because a later tree happens to look equal.
 */
export class BaseRangeSelection {
  readonly kind = "range" as const;
  /** Exact projection against which both endpoints were validated. */
  readonly projection: BaseDocumentProjection;
  /** Fixed endpoint from which extension began. */
  readonly anchor: BaseSelectionPoint;
  /** Actively extended endpoint; it is never sorted with the anchor. */
  readonly focus: BaseSelectionPoint;
  /** Document-relative spatial direction. */
  readonly order: BaseRangeOrder;

  private constructor(
    token: symbol,
    projection: BaseDocumentProjection,
    anchor: BaseSelectionPoint,
    focus: BaseSelectionPoint,
    order: BaseRangeOrder,
  ) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new TypeError("Use BaseRangeSelection.create().");
    }
    this.projection = projection;
    this.anchor = anchor;
    this.focus = focus;
    this.order = order;
    OWNED_SELECTIONS.add(this);
    Object.freeze(this);
  }

  /**
   * Validates and owns a range without retaining caller arrays or records.
   *
   * Text coordinates are UTF-16 code units, matching both the DOM and core.
   * An offset at a text end is valid; an offset inside a surrogate pair is not.
   */
  static create(
    projection: BaseDocumentProjection,
    input: unknown,
  ): BrowserSelectionResult<BaseRangeSelection> {
    if (!isOwnedProjection(projection)) {
      return selectionFailure("selection.invalid_shape");
    }
    try {
      const record = exactDataRecord(input, ["kind", "anchor", "focus"]);
      if (record === null || record["kind"] !== "range") {
        return selectionFailure("selection.invalid_shape");
      }
      const anchor = validatePoint(projection, record["anchor"]);
      if (!anchor.ok) {
        return selectionFailure(anchor.code);
      }
      const focus = validatePoint(projection, record["focus"]);
      if (!focus.ok) {
        return selectionFailure(focus.code);
      }
      const comparison = compareSpatialPositions(anchor.spatial, focus.spatial);
      const order: BaseRangeOrder =
        comparison < 0 ? "forward" : comparison > 0 ? "backward" : "collapsed";
      return selectionSuccess(
        new BaseRangeSelection(
          CONSTRUCTION_TOKEN,
          projection,
          anchor.point,
          focus.point,
          order,
        ),
      );
    } catch {
      return selectionFailure("selection.invalid_shape");
    }
  }
}

/** @internal */
export function isOwnedBaseRangeSelection(value: unknown): value is BaseRangeSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    OWNED_SELECTIONS.has(value as BaseRangeSelection)
  );
}

/** @internal */
export function spatialPositionForPoint(
  projection: BaseDocumentProjection,
  point: BaseSelectionPoint,
): SpatialPosition | null {
  if (!isOwnedProjection(projection)) {
    return null;
  }
  const path = point.kind === "text" ? point.textPath : point.parentPath;
  const paragraphIndex = path[0];
  if (paragraphIndex === undefined) {
    return null;
  }
  const paragraph = projection.paragraphs[paragraphIndex];
  if (paragraph === undefined) {
    return null;
  }
  let utf16Offset = 0;
  const boundary = point.kind === "text" ? path[1] : point.childIndex;
  if (boundary === undefined || boundary > paragraph.runs.length) {
    return null;
  }
  for (let runIndex = 0; runIndex < boundary; runIndex += 1) {
    const run = paragraph.runs[runIndex];
    if (run === undefined) {
      return null;
    }
    utf16Offset += run.text.length;
  }
  if (point.kind === "text") {
    utf16Offset += point.utf16Offset;
  }
  return { paragraphIndex, utf16Offset };
}

/** @internal */
export function baseSelectionPointsEqual(
  left: BaseSelectionPoint,
  right: BaseSelectionPoint,
): boolean {
  if (left.kind !== right.kind || left.affinity !== right.affinity) {
    return false;
  }
  if (left.kind === "text" && right.kind === "text") {
    return (
      pathsEqual(left.textPath, right.textPath) && left.utf16Offset === right.utf16Offset
    );
  }
  if (left.kind === "children" && right.kind === "children") {
    return pathsEqual(left.parentPath, right.parentPath) && left.childIndex === right.childIndex;
  }
  return false;
}

function validatePoint(projection: BaseDocumentProjection, input: unknown): PointValidation {
  const kindRecord = exactDataRecordByKind(input);
  if (kindRecord === null) {
    return { ok: false, code: "selection.invalid_shape" };
  }
  const affinity = kindRecord.record["affinity"];
  if (affinity !== "before" && affinity !== "after") {
    return { ok: false, code: "selection.invalid_shape" };
  }

  if (kindRecord.kind === "text") {
    const textPath = exactPath(kindRecord.record["textPath"], 2);
    const utf16Offset = kindRecord.record["utf16Offset"];
    if (textPath === null || !isU32(utf16Offset)) {
      return { ok: false, code: "selection.invalid_shape" };
    }
    const paragraph = projection.paragraphs[textPath[0] as number];
    const run = paragraph?.runs[textPath[1] as number];
    if (run === undefined || utf16Offset > run.text.length) {
      return { ok: false, code: "selection.invalid_point" };
    }
    if (!isUnicodeScalarBoundary(run.text, utf16Offset)) {
      return { ok: false, code: "selection.invalid_utf16_boundary" };
    }
    const point: BaseTextSelectionPoint = Object.freeze({
      kind: "text",
      textPath,
      utf16Offset,
      affinity,
    });
    const spatial = spatialPositionForPoint(projection, point);
    return spatial === null
      ? { ok: false, code: "selection.invalid_point" }
      : { ok: true, point, spatial };
  }

  const parentPath = exactPath(kindRecord.record["parentPath"], 1);
  const childIndex = kindRecord.record["childIndex"];
  if (parentPath === null || !isU32(childIndex)) {
    return { ok: false, code: "selection.invalid_shape" };
  }
  const paragraph = projection.paragraphs[parentPath[0] as number];
  if (paragraph === undefined || childIndex > paragraph.runs.length) {
    return { ok: false, code: "selection.invalid_point" };
  }
  const point: BaseChildrenSelectionPoint = Object.freeze({
    kind: "children",
    parentPath,
    childIndex,
    affinity,
  });
  const spatial = spatialPositionForPoint(projection, point);
  return spatial === null
    ? { ok: false, code: "selection.invalid_point" }
    : { ok: true, point, spatial };
}

function exactDataRecordByKind(
  input: unknown,
): { readonly kind: "text" | "children"; readonly record: Readonly<Record<string, unknown>> } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const kindDescriptor = Object.getOwnPropertyDescriptor(input, "kind");
  if (kindDescriptor === undefined || !("value" in kindDescriptor)) {
    return null;
  }
  if (kindDescriptor.value === "text") {
    const record = exactDataRecord(input, ["kind", "textPath", "utf16Offset", "affinity"]);
    return record === null ? null : { kind: "text", record };
  }
  if (kindDescriptor.value === "children") {
    const record = exactDataRecord(input, ["kind", "parentPath", "childIndex", "affinity"]);
    return record === null ? null : { kind: "children", record };
  }
  return null;
}

function exactDataRecord(
  input: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string")) {
    return null;
  }
  const record = input as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return null;
    }
  }
  return keys.every((key) => typeof key === "string" && expectedKeys.includes(key))
    ? record
    : null;
}

function exactPath(input: unknown, length: 1 | 2): AstPath | null {
  if (!Array.isArray(input) || input.length !== length) {
    return null;
  }
  const keys = Reflect.ownKeys(input);
  const expected = length === 1 ? ["0", "length"] : ["0", "1", "length"];
  if (
    keys.length !== expected.length ||
    keys.some((key) => typeof key !== "string" || !expected.includes(key))
  ) {
    return null;
  }
  const values: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (descriptor === undefined || !("value" in descriptor) || !isU32(descriptor.value)) {
      return null;
    }
    values.push(descriptor.value);
  }
  return Object.freeze(values);
}

function isU32(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_U32;
}

/** @internal */
export function isUnicodeScalarBoundary(text: string, offset: number): boolean {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {
    return false;
  }
  if (offset === 0 || offset === text.length) {
    return true;
  }
  const previous = text.charCodeAt(offset - 1);
  const current = text.charCodeAt(offset);
  return !(previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff);
}

function compareSpatialPositions(left: SpatialPosition, right: SpatialPosition): number {
  if (left.paragraphIndex !== right.paragraphIndex) {
    return left.paragraphIndex < right.paragraphIndex ? -1 : 1;
  }
  return left.utf16Offset === right.utf16Offset
    ? 0
    : left.utf16Offset < right.utf16Offset
      ? -1
      : 1;
}

function pathsEqual(left: AstPath, right: AstPath): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
