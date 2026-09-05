/** Stable failure codes returned by the browser projection boundary. */
export type BrowserProjectionErrorCode =
  | "projection.invalid_shape"
  | "projection.invalid_snapshot"
  | "projection.resource_limit"
  | "projection.noncanonical_runs"
  | "projection.invalid_update"
  | "renderer.invalid_host"
  | "renderer.foreign_or_stale_render"
  | "renderer.dom_write_failed";

/** A payload-redacted browser projection failure. */
export interface BrowserProjectionError {
  /** Stable machine-readable failure code. */
  readonly code: BrowserProjectionErrorCode;
  /** Static, payload-redacted diagnostic. */
  readonly message: string;
}

/** Result returned without throwing for domain and validation failures. */
export type BrowserProjectionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BrowserProjectionError };

const ERROR_MESSAGES: Readonly<Record<BrowserProjectionErrorCode, string>> = Object.freeze({
  "projection.invalid_shape": "The base projection has an invalid shape.",
  "projection.invalid_snapshot": "The projection snapshot identity is invalid.",
  "projection.resource_limit": "The base projection exceeds a renderer resource limit.",
  "projection.noncanonical_runs": "The paragraph text runs are not canonical.",
  "projection.invalid_update": "The projection update does not prove its claimed impact.",
  "renderer.invalid_host": "The renderer host is not a usable DOM element.",
  "renderer.foreign_or_stale_render":
    "The rendered projection is stale or belongs to another renderer.",
  "renderer.dom_write_failed": "The DOM projection could not be installed.",
});

/** @internal */
export function projectionFailure<T>(
  code: BrowserProjectionErrorCode,
): BrowserProjectionResult<T> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message: ERROR_MESSAGES[code] }),
  });
}

/** @internal */
export function projectionSuccess<T>(value: T): BrowserProjectionResult<T> {
  return Object.freeze({ ok: true, value });
}
