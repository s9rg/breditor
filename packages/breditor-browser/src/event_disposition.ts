import type { CommandQueueSubmission } from "./command_queue.js";

/** Why an owned event could not safely become a semantic command. */
export type BrowserEventBlockReason =
  | "unsupportedInputType"
  | "invalidText"
  | "invalidEvent"
  | "selectionUnavailable"
  | "targetRangeUnavailable"
  | "targetRangeCount"
  | "targetRangeMismatch"
  | "targetRangeInvalid"
  | "unsupportedEditingShortcut"
  | "unsupportedLineBreak"
  | "textRequiresBeforeInput"
  | "repeatSuppressed"
  | "queueRejected";

/** Why native behavior was deliberately left alone. */
export type BrowserEventIgnoreReason =
  | "outsideHost"
  | "nestedControl"
  | "alreadyDefaultPrevented"
  | "beforeinputOwns"
  | "clipboardOwns"
  | "selectionOrPageCommand";

/** Why canonical DOM reconciliation is now required. */
export type BrowserEventReconcileReason =
  | "noncancelableMutation"
  | "preventDefaultFailed"
  | "eventAccessFailed"
  | "deliveryRejected"
  | "queueFailure"
  | "unexpectedInput"
  | "domDrift";

/** Explicit result of one browser event callback. */
export type BrowserEventDisposition<TResult> =
  | Readonly<{
      kind: "handled";
      defaultPrevented: true;
      submission: CommandQueueSubmission<TResult>;
    }>
  | Readonly<{
      kind: "blocked";
      defaultPrevented: true;
      reason: BrowserEventBlockReason;
    }>
  | Readonly<{
      kind: "ignored";
      defaultPrevented: boolean;
      reason: BrowserEventIgnoreReason;
    }>
  | Readonly<{
      kind: "compositionPending";
      defaultPrevented: false;
    }>
  | Readonly<{
      kind: "reconcileRequired";
      defaultPrevented: boolean;
      reason: BrowserEventReconcileReason;
    }>
  | Readonly<{
      kind: "keyboardEcho";
      defaultPrevented: true;
      inputType: string;
    }>
  | Readonly<{
      kind: "inputPostcondition";
      expectedEcho:
        | Readonly<{ kind: "keyboard"; inputType: string }>
        | undefined;
    }>;

/** Stable reasons a document `selectionchange` did not enter the queue. */
export type BrowserSelectionChangeBlockReason =
  | "compositionActive"
  | "invalidEvent"
  | "selectionUnavailable"
  | "queueRejected";

/** Non-error reasons a document `selectionchange` deliberately did no work. */
export type BrowserSelectionChangeIgnoreReason =
  | "programmaticEcho"
  | "noDomRange"
  | "outsideHost";

/** Total result of reducing one document `selectionchange` observation. */
export type BrowserSelectionChangeDisposition<TResult> =
  | Readonly<{
      kind: "synchronized";
      submission: CommandQueueSubmission<TResult>;
    }>
  | Readonly<{
      kind: "blocked";
      reason: BrowserSelectionChangeBlockReason;
    }>
  | Readonly<{
      kind: "ignored";
      reason: BrowserSelectionChangeIgnoreReason;
    }>
  | Readonly<{
      kind: "reconcileRequired";
      reason: "deliveryRejected" | "domDrift" | "queueFailure";
    }>;
