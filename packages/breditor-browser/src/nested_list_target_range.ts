import { isOwnedNestedListRenderedProjection, type RenderedProjection } from "./dom_renderer.js";
import type { NestedListDocumentProjection } from "./nested_list_projection.js";
import { NestedListRangeSelection } from "./nested_list_selection.js";
import { exactDataRecord } from "./projection.js";
import type { BaseSelectionPoint } from "./selection.js";
import { selectionFailure, selectionSuccess, type BrowserSelectionResult } from "./selection_result.js";

const TOKEN = Symbol("NestedListTargetRange construction");
const OWNED = new WeakSet<NestedListTargetRange>();

/** Ordered, immutable target endpoints bound to one exact hierarchical render. */
export class NestedListTargetRange {
  readonly kind = "range" as const;
  readonly projection: NestedListDocumentProjection;
  readonly rendererGeneration: bigint;
  private constructor(token: symbol, readonly rendered: RenderedProjection<NestedListDocumentProjection>,
    readonly start: BaseSelectionPoint, readonly end: BaseSelectionPoint) {
    if (token !== TOKEN) throw new TypeError("Use NestedListTargetRange.create().");
    this.projection = rendered.projection;
    this.rendererGeneration = rendered.rendererGeneration;
    OWNED.add(this); Object.freeze(this);
  }

  static create(rendered: RenderedProjection<NestedListDocumentProjection>, input: unknown): BrowserSelectionResult<NestedListTargetRange> {
    if (!isOwnedNestedListRenderedProjection(rendered) || !rendered.current) return selectionFailure("selection.foreign_or_stale_render");
    try {
      if (!rendered.validateCanonicalDom()) return selectionFailure("selection.dom_drift");
      const record = exactDataRecord(input, ["kind", "start", "end"]);
      if (record?.["kind"] !== "range") return selectionFailure("selection.invalid_shape");
      const checked = NestedListRangeSelection.create(rendered.projection,
        {kind: "range", anchor: record["start"], focus: record["end"]});
      if (!checked.ok) return checked;
      if (checked.value.order === "backward") return selectionFailure("selection.invalid_shape");
      if (!rendered.validateCanonicalDom()) return selectionFailure("selection.dom_drift");
      return selectionSuccess(new NestedListTargetRange(TOKEN, rendered, checked.value.anchor, checked.value.focus));
    } catch { return selectionFailure("selection.invalid_shape"); }
  }
}
Object.freeze(NestedListTargetRange.prototype);

/** @internal */
export function isOwnedNestedListTargetRange(value: unknown): value is NestedListTargetRange {
  return typeof value === "object" && value !== null && OWNED.has(value as NestedListTargetRange);
}
