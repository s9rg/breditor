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
  | "clipboardEchoWithoutReceipt"
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
      kind: "clipboardEcho";
      defaultPrevented: true;
      operation: "cut" | "paste";
    }>
  | Readonly<{
      kind: "keyboardEcho";
      defaultPrevented: true;
      inputType: string;
    }>
  | Readonly<{
      kind: "inputPostcondition";
      expectedEcho:
        | Readonly<{ kind: "clipboard"; operation: "cut" | "paste" }>
        | Readonly<{ kind: "keyboard"; inputType: string }>
        | undefined;
    }>;
