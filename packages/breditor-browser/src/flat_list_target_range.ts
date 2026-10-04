import { isOwnedFlatListRenderedProjection, type RenderedProjection } from "./dom_renderer.js";
import type { FlatListDocumentProjection } from "./flat_list_projection.js";
import { FlatListRangeSelection } from "./flat_list_selection.js";
import { exactDataRecord } from "./projection.js";
import type { BaseSelectionPoint } from "./selection.js";
import { selectionFailure, selectionSuccess, type BrowserSelectionResult } from "./selection_result.js";

const TOKEN = Symbol("FlatListTargetRange construction");
const OWNED = new WeakSet<FlatListTargetRange>();

/** Ordered, immutable target endpoints bound to one exact hierarchical render. */
export class FlatListTargetRange {
  readonly kind = "range" as const;
  readonly projection: FlatListDocumentProjection;
  readonly rendererGeneration: bigint;
  private constructor(token: symbol, readonly rendered: RenderedProjection<FlatListDocumentProjection>,
    readonly start: BaseSelectionPoint, readonly end: BaseSelectionPoint) {
    if (token !== TOKEN) throw new TypeError("Use FlatListTargetRange.create().");
    this.projection = rendered.projection;
    this.rendererGeneration = rendered.rendererGeneration;
    OWNED.add(this); Object.freeze(this);
  }

  static create(rendered: RenderedProjection<FlatListDocumentProjection>, input: unknown): BrowserSelectionResult<FlatListTargetRange> {
    if (!isOwnedFlatListRenderedProjection(rendered) || !rendered.current) return selectionFailure("selection.foreign_or_stale_render");
    try {
      if (!rendered.validateCanonicalDom()) return selectionFailure("selection.dom_drift");
      const record = exactDataRecord(input, ["kind", "start", "end"]);
      if (record?.["kind"] !== "range") return selectionFailure("selection.invalid_shape");
      const checked = FlatListRangeSelection.create(rendered.projection,
        {kind: "range", anchor: record["start"], focus: record["end"]});
      if (!checked.ok) return checked;
      if (checked.value.order === "backward") return selectionFailure("selection.invalid_shape");
      if (!rendered.validateCanonicalDom()) return selectionFailure("selection.dom_drift");
      return selectionSuccess(new FlatListTargetRange(TOKEN, rendered, checked.value.anchor, checked.value.focus));
    } catch { return selectionFailure("selection.invalid_shape"); }
  }
}
Object.freeze(FlatListTargetRange.prototype);

/** @internal */
export function isOwnedFlatListTargetRange(value: unknown): value is FlatListTargetRange {
  return typeof value === "object" && value !== null && OWNED.has(value as FlatListTargetRange);
}
