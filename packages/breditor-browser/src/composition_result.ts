/** Stable failure codes for the browser composition boundary. */
export type CompositionErrorCode =
  | "composition.invalid_event"
  | "composition.invalid_text"
  | "composition.invalid_state"
  | "composition.invalid_signal"
  | "composition.invalid_transition"
  | "composition.session_exhausted"
  | "composition.candidate_unavailable"
  | "composition.candidate_conflict"
  | "composition.dom.invalid_input"
  | "composition.dom.cross_paragraph"
  | "composition.dom.invalid_structure"
  | "composition.dom.unchanged_region_mismatch"
  | "composition.dom.resource_limit"
  | "composition.dom.invalid_unicode";

/** A payload-redacted composition failure safe to expose to applications. */
export interface CompositionError {
  /** Stable machine-readable failure code. */
  readonly code: CompositionErrorCode;
  /** Static diagnostic which never includes composed text or DOM content. */
  readonly message: string;
}

/** Total result returned by composition validation and state transitions. */
export type CompositionResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: CompositionError }>;

/** Why an active composition must abandon its temporary DOM lease. */
export type CompositionAbortReason =
  | "invalidEvent"
  | "invalidText"
  | "invalidTransition"
  | "orphanInput"
  | "targetUnavailable"
  | "targetInvalid"
  | "unexpectedMutation"
  | "staleBase"
  | "domReconcileFailed"
  | "queueRejected"
  | "uncertain"
  | "disposed";

/** Terminal controller outcome after the leased DOM has been discarded. */
export type CompositionSettlement<TSubmission> =
  | Readonly<{ kind: "committed"; submission: TSubmission }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "recoveryRequired"; reason: CompositionAbortReason }>;

const ERROR_MESSAGES: Readonly<Record<CompositionErrorCode, string>> = Object.freeze({
  "composition.invalid_event": "The composition event snapshot is invalid.",
  "composition.invalid_text": "The composition text is not an admissible bounded Unicode string.",
  "composition.invalid_state": "The composition state is not owned by this module.",
  "composition.invalid_signal": "The composition state signal is invalid.",
  "composition.invalid_transition": "The composition signal is not valid in the current phase.",
  "composition.session_exhausted": "The composition session identifier space is exhausted.",
  "composition.candidate_unavailable": "No final composition candidate is available.",
  "composition.candidate_conflict": "Composition evidence disagrees about the final text.",
  "composition.dom.invalid_input": "The composition DOM reconciliation input is invalid.",
  "composition.dom.cross_paragraph": "Composition DOM fallback is limited to one paragraph.",
  "composition.dom.invalid_structure": "The leased DOM contains unsupported structure or unrelated changes.",
  "composition.dom.unchanged_region_mismatch": "Text outside the composition target changed.",
  "composition.dom.resource_limit": "The leased DOM exceeds a composition resource limit.",
  "composition.dom.invalid_unicode": "The leased DOM contains invalid Unicode scalar text.",
});

/** @internal */
export function compositionSuccess<T>(value: T): CompositionResult<T> {
  return Object.freeze({ ok: true, value });
}

/** @internal */
export function compositionFailure<T>(code: CompositionErrorCode): CompositionResult<T> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message: ERROR_MESSAGES[code] }),
  });
}

/** Creates a frozen committed settlement receipt. */
export function committedComposition<TSubmission>(
  submission: TSubmission,
): CompositionSettlement<TSubmission> {
  return Object.freeze({ kind: "committed", submission });
}

/** Creates the shared, immutable cancellation settlement. */
export function cancelledComposition(): CompositionSettlement<never> {
  return CANCELLED_COMPOSITION;
}

/** Creates a frozen, payload-redacted recovery settlement. */
export function compositionRecoveryRequired(
  reason: CompositionAbortReason,
): CompositionSettlement<never> {
  return Object.freeze({ kind: "recoveryRequired", reason });
}

const CANCELLED_COMPOSITION: CompositionSettlement<never> = Object.freeze({
  kind: "cancelled",
});
