import {
  type RenderedProjection,
  isOwnedRenderedProjection,
} from "./dom_renderer.js";
import type { BaseDocumentProjection } from "./projection.js";
import { isOwnedProjection } from "./projection.js";
import {
  BaseRangeSelection,
  type BaseRangeSelectionInput,
  type BaseSelectionPoint,
  baseSelectionPointsEqual,
} from "./selection.js";
import type { BrowserSelectionResult } from "./selection_result.js";
import { selectionFailure, selectionSuccess } from "./selection_result.js";

/** Input accepted by {@link BaseTargetRange.create}. */
export interface BaseTargetRangeInput {
  readonly kind: "range";
  readonly start: BaseRangeSelectionInput["anchor"];
  readonly end: BaseRangeSelectionInput["focus"];
}

const CONSTRUCTION_TOKEN = Symbol("BaseTargetRange construction");
const OWNED_TARGET_RANGES = new WeakSet<BaseTargetRange>();

interface BaseTargetRangeInputSnapshot {
  readonly kind: unknown;
  readonly start: unknown;
  readonly end: unknown;
}

/**
 * One immutable, directionless target range from an exact DOM render generation.
 *
 * Unlike a directional editor selection, the endpoints are always ordered as
 * `start` then `end`. The range deliberately owns no DOM endpoint or
 * `AbstractRange`; callers can retain it without retaining a transient native
 * event range. Its semantic coordinates remain bound to the exact projection
 * and render handle from which they were normalized.
 */
export class BaseTargetRange {
  readonly kind = "range" as const;
  /** Exact semantic projection against which both endpoints were checked. */
  readonly projection: BaseDocumentProjection;
  /** Exact renderer handle which normalized this range. */
  readonly rendered: RenderedProjection;
  /** Generation captured independently so equality cannot alias renderer instances. */
  readonly rendererGeneration: bigint;
  /** Document-order beginning of the target. */
  readonly start: BaseSelectionPoint;
  /** Document-order end of the target. */
  readonly end: BaseSelectionPoint;

  private constructor(
    token: symbol,
    rendered: RenderedProjection,
    start: BaseSelectionPoint,
    end: BaseSelectionPoint,
  ) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new TypeError("Use BaseTargetRange.create().");
    }
    this.projection = rendered.projection;
    this.rendered = rendered;
    this.rendererGeneration = rendered.rendererGeneration;
    this.start = start;
    this.end = end;
    OWNED_TARGET_RANGES.add(this);
    Object.freeze(this);
  }

  /**
   * Checks and owns semantic endpoints for one exact current render generation.
   *
   * Endpoint records and path arrays are copied by `BaseRangeSelection`; caller
   * records are never retained. A reversed semantic range is rejected because
   * native target ranges are directionless and ordered.
   */
  static create(
    rendered: RenderedProjection,
    input: unknown,
  ): BrowserSelectionResult<BaseTargetRange> {
    if (
      !isOwnedRenderedProjection(rendered) ||
      !rendered.current ||
      !isOwnedProjection(rendered.projection)
    ) {
      return selectionFailure("selection.foreign_or_stale_render");
    }

    try {
      if (!rendered.validateCanonicalDom()) {
        return selectionFailure("selection.dom_drift");
      }
      const record = snapshotTargetRangeInput(input);
      if (record === null || record["kind"] !== "range") {
        return selectionFailure("selection.invalid_shape");
      }
      const checked = BaseRangeSelection.create(rendered.projection, {
        kind: "range",
        anchor: record["start"],
        focus: record["end"],
      });
      if (!checked.ok) {
        return checked;
      }
      if (checked.value.order === "backward") {
        return selectionFailure("selection.invalid_shape");
      }
      if (!rendered.validateCanonicalDom()) {
        return selectionFailure("selection.dom_drift");
      }
      return selectionSuccess(
        new BaseTargetRange(
          CONSTRUCTION_TOKEN,
          rendered,
          checked.value.anchor,
          checked.value.focus,
        ),
      );
    } catch {
      return selectionFailure("selection.invalid_shape");
    }
  }
}

// These instances carry renderer authority. Prevent application code from
// replacing prototype behavior after a value has entered the ownership set.
Object.freeze(BaseTargetRange.prototype);

/** Returns whether a value was constructed by this module. */
export function isOwnedBaseTargetRange(value: unknown): value is BaseTargetRange {
  return (
    typeof value === "object" &&
    value !== null &&
    OWNED_TARGET_RANGES.has(value as BaseTargetRange)
  );
}

/**
 * Exact equality for normalized target ranges.
 *
 * Equal-looking snapshots or generations from different renderer handles do
 * not compare equal. Endpoint affinity participates because it identifies the
 * content side associated with a boundary.
 */
export function baseTargetRangesEqual(
  left: BaseTargetRange,
  right: BaseTargetRange,
): boolean {
  return (
    isOwnedBaseTargetRange(left) &&
    isOwnedBaseTargetRange(right) &&
    left.projection === right.projection &&
    left.rendered === right.rendered &&
    left.rendererGeneration === right.rendererGeneration &&
    baseSelectionPointsEqual(left.start, right.start) &&
    baseSelectionPointsEqual(left.end, right.end)
  );
}

function snapshotTargetRangeInput(input: unknown): BaseTargetRangeInputSnapshot | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const keys = Reflect.ownKeys(input);
  const expectedKeys = ["kind", "start", "end"] as const;
  if (
    keys.length !== expectedKeys.length ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        (key !== "kind" && key !== "start" && key !== "end"),
    )
  ) {
    return null;
  }
  const kind = Object.getOwnPropertyDescriptor(input, "kind");
  const start = Object.getOwnPropertyDescriptor(input, "start");
  const end = Object.getOwnPropertyDescriptor(input, "end");
  if (
    kind === undefined ||
    !("value" in kind) ||
    start === undefined ||
    !("value" in start) ||
    end === undefined ||
    !("value" in end)
  ) {
    return null;
  }
  return Object.freeze({ kind: kind.value, start: start.value, end: end.value });
}
