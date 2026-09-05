/** Stable, payload-redacted failures at the browser selection boundary. */
export type BrowserSelectionErrorCode =
  | "selection.invalid_shape"
  | "selection.invalid_point"
  | "selection.invalid_utf16_boundary"
  | "selection.snapshot_mismatch"
  | "selection.invalid_wasm_view"
  | "selection.foreign_or_stale_render"
  | "selection.dom_drift"
  | "selection.selection_api_unavailable"
  | "selection.multirange_unsupported"
  | "selection.crosses_host"
  | "selection.ambiguous_dom_point"
  | "selection.backward_unsupported"
  | "selection.dom_read_failed"
  | "selection.dom_write_failed";

/** A payload-redacted selection failure safe to log outside the editor core. */
export interface BrowserSelectionError {
  /** Stable machine-readable failure code. */
  readonly code: BrowserSelectionErrorCode;
  /** Static diagnostic which never contains document or selection contents. */
  readonly message: string;
}

/** Result returned without throwing for selection validation and DOM failures. */
export type BrowserSelectionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BrowserSelectionError };

const ERROR_MESSAGES: Readonly<Record<BrowserSelectionErrorCode, string>> = Object.freeze({
  "selection.invalid_shape": "The range selection has an invalid shape.",
  "selection.invalid_point": "A selection endpoint is not valid in the base projection.",
  "selection.invalid_utf16_boundary":
    "A selection endpoint is not a Unicode-scalar UTF-16 boundary.",
  "selection.snapshot_mismatch": "The selection and projection snapshots do not match.",
  "selection.invalid_wasm_view": "The Wasm selection view is invalid.",
  "selection.foreign_or_stale_render": "The rendered projection is foreign or stale.",
  "selection.dom_drift": "The rendered DOM no longer exactly represents its projection.",
  "selection.selection_api_unavailable":
    "The rendered host's document does not expose a usable Selection API.",
  "selection.multirange_unsupported": "Multiple DOM ranges are not supported.",
  "selection.crosses_host": "The DOM selection crosses the rendered host boundary.",
  "selection.ambiguous_dom_point":
    "A DOM endpoint cannot be mapped to one supported base-schema point.",
  "selection.backward_unsupported":
    "This Selection implementation cannot install a directional backward range.",
  "selection.dom_read_failed": "The DOM selection could not be read safely.",
  "selection.dom_write_failed": "The DOM selection could not be installed exactly.",
});

/** @internal */
export function selectionFailure<T>(
  code: BrowserSelectionErrorCode,
): BrowserSelectionResult<T> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message: ERROR_MESSAGES[code] }),
  });
}

/** @internal */
export function selectionSuccess<T>(value: T): BrowserSelectionResult<T> {
  return Object.freeze({ ok: true, value });
}
