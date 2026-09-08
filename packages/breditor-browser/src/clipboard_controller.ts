import {
  BreditorCommandQueue,
  openCommandQueueLeasePort,
  type CommandQueueLease,
  type CommandQueueLeasePort,
  type CommandQueueLeasedSubmission,
} from "./command_queue.js";
import {
  cutDeleteRequest,
  pasteInsertRequest,
} from "./clipboard_command.js";
import {
  serializeClipboardSelection,
} from "./clipboard_fragment.js";
import { parseClipboardHtmlToPlainText } from "./clipboard_html.js";
import { classifyDomEventOwnership } from "./dom_event_ownership.js";
import {
  clearDomDataTransferData,
  preventDomEventDefault,
  readDomClipboardData,
  readDomDataTransferData,
  readDomDataTransferTypes,
  readDomEventBase,
  readDomEventStatus,
  readDomInputEvent,
  setDomDataTransferData,
  type DomEventBaseSnapshot,
  type DomEventSource,
} from "./dom_event_intrinsics.js";
import { nativeHtmlHostFacts } from "./html_host.js";
import {
  isOwnedRenderedProjection,
  type RenderedProjection,
} from "./dom_renderer.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import {
  rangeSelectionSync,
  type EditorDeliveryToken,
  type EditorSelectionSync,
} from "./editor_command.js";
import {
  isOwnedBaseRangeSelection,
  type BaseRangeSelection,
} from "./selection.js";
import {
  projectionMatchesBrowserPresentation,
  projectionPresentation,
  projectionProfileDescriptor,
} from "./projection.js";
import type { BrowserCompiledPresentation } from "./compiled_browser_presentation.js";
import type {
  BreditorWasmCommandAdapter,
  WasmCommandSequenceOutcome,
} from "./wasm_command_adapter.js";
import { snapshotOwnDataArray } from "./protected_handle_snapshot.js";

/** Native clipboard operation owned by this controller. */
export type ClipboardControllerOperation = "copy" | "cut" | "paste";

/** Stable, payload-free reason for an ignored native callback. */
export type ClipboardControllerIgnoreReason =
  | "outsideHost"
  | "nestedControl"
  | "alreadyDefaultPrevented"
  | "notClipboardInput";

/** Stable, payload-free reason why owned clipboard work did not complete. */
export type ClipboardControllerFailureReason =
  | "adapterUnavailable"
  | "queueUnavailable"
  | "invalidEvent"
  | "selectionUnavailable"
  | "invalidSelection"
  | "clipboardUnavailable"
  | "clipboardReadFailed"
  | "clipboardWriteFailed"
  | "unsupportedClipboardPayload"
  | "invalidPlainText"
  | "invalidHtml"
  | "cancellationFailed"
  | "staleBase"
  | "queueRejected"
  | "queueFailure"
  | "commandRejected"
  | "receiptUnavailable"
  | "echoWithoutReceipt"
  | "unexpectedInput"
  | "leaseReleaseFailed"
  | "disposed";

/** Observable clipboard progress for a single callback, never its contents. */
export type ClipboardControllerClipboardState =
  | "untouched"
  | "readAttempted"
  | "cleared"
  | "plainWritten"
  | "representationsWritten"
  | "writeUncertain";

/** Observable command progress for a single callback. */
export type ClipboardControllerCommandState =
  | "notApplicable"
  | "notAttempted"
  | "completed"
  | "uncertain";

/**
 * Redacted partial-state report for a non-atomic browser/core transaction.
 *
 * Clipboard APIs and the Rust command cannot be rolled back together. These
 * fields state exactly how far the callback got without retaining copied or
 * pasted text, an Event, a DataTransfer, or a semantic document handle.
 */
export interface ClipboardControllerPartialState {
  readonly clipboard: ClipboardControllerClipboardState;
  readonly cancellation: "notAttempted" | "confirmed" | "failed";
  readonly command: ClipboardControllerCommandState;
}

/** Payload-redacted result of one clipboard or clipboard-echo callback. */
export type ClipboardControllerDisposition =
  | Readonly<{
      kind: "handled";
      operation: ClipboardControllerOperation;
      defaultPrevented: true;
      partial: ClipboardControllerPartialState;
      sequence?: bigint;
    }>
  | Readonly<{
      kind: "ignored";
      operation: ClipboardControllerOperation;
      defaultPrevented: boolean;
      reason: ClipboardControllerIgnoreReason;
    }>
  | Readonly<{
      kind: "blocked";
      operation: ClipboardControllerOperation;
      defaultPrevented: boolean;
      reason: ClipboardControllerFailureReason;
      partial: ClipboardControllerPartialState;
    }>
  | Readonly<{
      kind: "reconcileRequired";
      operation: ClipboardControllerOperation;
      defaultPrevented: boolean;
      reason: ClipboardControllerFailureReason;
      partial: ClipboardControllerPartialState;
    }>
  | Readonly<{
      kind: "beforeinputEcho";
      operation: "cut" | "paste";
      defaultPrevented: true;
    }>
  | Readonly<{
      kind: "inputPostcondition";
      operation: "cut" | "paste";
    }>
  | Readonly<{ kind: "disposed" }>;

interface AdapterSurface {
  readonly commandExecutor: (
    request: Parameters<BreditorWasmCommandAdapter["execute"]>[0],
  ) => WasmCommandSequenceOutcome;
  readonly rendered: RenderedProjection;
  readonly state: BreditorWasmCommandAdapter["state"];
  readonly selectionBridge: BreditorDomSelectionBridge;
  acceptsDeliveryToken(token: unknown): token is EditorDeliveryToken;
  deliveryToken(): EditorDeliveryToken;
}

interface CanonicalBase {
  readonly rendered: RenderedProjection;
  readonly delivery: EditorDeliveryToken;
  readonly presentation: BrowserCompiledPresentation | undefined;
}

type EventIdentitySnapshot =
  | Readonly<{
      status: "matched";
      target: EventTarget | null;
      base: DomEventBaseSnapshot;
    }>
  | Readonly<{ status: "matchedInvalid" }>
  | Readonly<{ status: "mismatch" }>;

interface CancelableEventSnapshot {
  readonly source: DomEventSource;
  readonly cancelable: boolean;
  readonly defaultPrevented: boolean;
}

interface ClipboardCapability {
  readonly source: DomEventSource;
  readonly value: object;
}

interface EchoReceipt {
  readonly operation: "cut" | "paste";
  readonly phase: "beforeinput" | "input";
  readonly inputType?: string;
  readonly rendered: RenderedProjection;
  readonly delivery: EditorDeliveryToken;
}

interface ReceiptCandidate {
  readonly operation: "cut" | "paste";
  readonly rendered: RenderedProjection;
  readonly delivery: EditorDeliveryToken;
}

interface LeasedOutcome {
  readonly disposition: ClipboardControllerDisposition;
  readonly receipt?: ReceiptCandidate | EchoReceipt;
}

interface MutableProgress {
  clipboard: ClipboardControllerClipboardState;
  cancellation: "notAttempted" | "confirmed" | "failed";
  command: ClipboardControllerCommandState;
}

interface CancellationOutcome {
  readonly confirmed: boolean;
  readonly defaultPrevented: boolean;
  readonly stale: boolean;
}

const MAX_CLIPBOARD_MIME_TYPES = 64;
const MAX_CLIPBOARD_MIME_TYPE_UTF16 = 256;
const PLAIN_TEXT_MIME = "text/plain";
const HTML_MIME = "text/html";

/**
 * Synchronous, capability-bounded clipboard coordinator for one Wasm adapter.
 *
 * Each callback reserves the exact adapter queue before touching clipboard
 * capabilities or cancellation state. Copy and cut serialize only the branded
 * semantic selection. Paste reduces DataTransfer strings to one bounded plain
 * string before submitting exactly one engine request. Native Event and
 * DataTransfer objects never escape or enter a receipt.
 */
export class BreditorClipboardController {
  readonly #queuePort: CommandQueueLeasePort<WasmCommandSequenceOutcome>;
  readonly #adapter: AdapterSurface;
  #receipt: EchoReceipt | undefined;
  #activeLease: CommandQueueLease | undefined;
  #disposed = false;

  constructor(
    queue: BreditorCommandQueue<WasmCommandSequenceOutcome>,
    adapter: BreditorWasmCommandAdapter,
  ) {
    if (!(queue instanceof BreditorCommandQueue)) {
      throw new TypeError("clipboard queue is invalid");
    }
    const surface = adapter as AdapterSurface;
    let valid = false;
    let executor: AdapterSurface["commandExecutor"] | undefined;
    try {
      executor = surface.commandExecutor;
      valid =
        typeof executor === "function" &&
        surface.commandExecutor === executor &&
        surface.selectionBridge instanceof BreditorDomSelectionBridge &&
        typeof surface.deliveryToken === "function" &&
        typeof surface.acceptsDeliveryToken === "function";
    } catch {
      valid = false;
    }
    if (!valid || executor === undefined) {
      throw new TypeError("clipboard adapter is invalid");
    }
    const queuePort = openCommandQueueLeasePort(queue, executor);
    if (queuePort === undefined) {
      throw new TypeError("clipboard queue must own the adapter executor");
    }
    this.#queuePort = queuePort;
    this.#adapter = surface;
  }

  /** Handles one native copy without submitting a semantic command. */
  handleCopy(event: unknown): ClipboardControllerDisposition {
    this.#receipt = undefined;
    return this.#withLease("copy", (lease) =>
      this.#handleClipboardEvent("copy", event, lease),
    );
  }

  /** Writes both representations, cancels native cut, then deletes once. */
  handleCut(event: unknown): ClipboardControllerDisposition {
    this.#receipt = undefined;
    return this.#withLease("cut", (lease) =>
      this.#handleClipboardEvent("cut", event, lease),
    );
  }

  /** Reads one authoritative representation, cancels, then inserts once. */
  handlePaste(event: unknown): ClipboardControllerDisposition {
    this.#receipt = undefined;
    return this.#withLease("paste", (lease) =>
      this.#handleClipboardEvent("paste", event, lease),
    );
  }

  /** Consumes the optional cancelable beforeinput following an owned cut/paste. */
  handleBeforeInput(event: unknown): ClipboardControllerDisposition {
    return this.#withLease(this.#receipt?.operation ?? "paste", (lease) =>
      this.#handleBeforeInputLeased(event, lease),
    );
  }

  /** Consumes the optional non-mutating input postcondition exactly once. */
  handleInput(event: unknown): ClipboardControllerDisposition {
    return this.#withLease(
      this.#receipt?.operation ?? "paste",
      () => this.#handleInputLeased(event),
    );
  }

  /** Explicitly invalidates any unconsumed cut/paste echo authorization. */
  forgetEchoReceipt(): void {
    this.#receipt = undefined;
  }

  /** Makes this controller inert. An in-flight callback retains its lease. */
  dispose(): void {
    this.#disposed = true;
    this.#receipt = undefined;
  }

  #withLease(
    operation: ClipboardControllerOperation,
    callback: (lease: CommandQueueLease) => LeasedOutcome,
  ): ClipboardControllerDisposition {
    if (this.#disposed) return Object.freeze({ kind: "disposed" });
    let lease: CommandQueueLease | undefined;
    try {
      lease = this.#queuePort.acquireLease();
    } catch {
      lease = undefined;
    }
    if (lease === undefined) {
      this.#receipt = undefined;
      const partial = progress("untouched", "notAttempted", "notAttempted");
      return operation === "copy"
        ? blocked(operation, "queueUnavailable", false, partial)
        : reconcile(operation, "queueUnavailable", false, partial);
    }
    this.#activeLease = lease;

    let outcome: LeasedOutcome;
    try {
      outcome = callback(lease);
    } catch {
      outcome = {
        disposition: reconcile(
          operation,
          "invalidEvent",
          false,
          progress("untouched", "notAttempted", "notAttempted"),
        ),
      };
    }

    let released = false;
    try {
      released = this.#queuePort.releaseLease(lease);
    } catch {
      released = false;
    }
    if (this.#activeLease === lease) this.#activeLease = undefined;
    if (!released) {
      this.#receipt = undefined;
      return reconcile(
        operationForDisposition(outcome.disposition, operation),
        "leaseReleaseFailed",
        defaultPreventedForDisposition(outcome.disposition),
        partialForDisposition(outcome.disposition),
      );
    }
    if (this.#disposed) {
      this.#receipt = undefined;
      return outcome.receipt === undefined
        ? outcome.disposition
        : reconcile(
            outcome.receipt.operation,
            "disposed",
            defaultPreventedForDisposition(outcome.disposition),
            partialForDisposition(outcome.disposition),
          );
    }

    if (outcome.receipt !== undefined) {
      if (!this.#receiptCandidateIsCurrent(outcome.receipt)) {
        this.#receipt = undefined;
        return reconcile(
          outcome.receipt.operation,
          "receiptUnavailable",
          defaultPreventedForDisposition(outcome.disposition),
          partialForDisposition(outcome.disposition),
        );
      }
      this.#receipt = Object.freeze(
        "phase" in outcome.receipt
          ? outcome.receipt
          : {
              ...outcome.receipt,
              phase: "beforeinput" as const,
            },
      );
    }
    return outcome.disposition;
  }

  #handleClipboardEvent(
    operation: ClipboardControllerOperation,
    event: unknown,
    lease: CommandQueueLease,
  ): LeasedOutcome {
    const mutable = mutableProgress(
      "untouched",
      "notAttempted",
      operation === "copy" ? "notApplicable" : "notAttempted",
    );
    const base = this.#captureCanonicalBase();
    if (base === null) {
      return simpleOutcome(
        reconcile(operation, "adapterUnavailable", false, freezeProgress(mutable)),
      );
    }

    const identity = readExpectedEventIdentity(event, operation);
    if (identity.status === "mismatch") {
      return simpleOutcome(
        this.#baseIsCurrent(base)
          ? blocked(operation, "invalidEvent", false, freezeProgress(mutable))
          : reconcile(operation, "staleBase", false, freezeProgress(mutable)),
      );
    }
    if (identity.status === "matchedInvalid") {
      return this.#blindCancelFailure(
        operation,
        event,
        base,
        mutable,
        this.#baseIsCurrent(base) ? "invalidEvent" : "staleBase",
      );
    }
    const ownership = classifyDomEventOwnership(base.rendered.host, identity.target);
    if (!this.#baseIsCurrent(base)) {
      return ownership === "owned" || ownership === "invalid"
        ? this.#blindCancelFailure(
            operation,
            event,
            base,
            mutable,
            "staleBase",
          )
        : simpleOutcome(
            reconcile(operation, "staleBase", false, freezeProgress(mutable)),
          );
    }
    if (ownership === "outsideHost" || ownership === "nestedControl") {
      return simpleOutcome(ignored(operation, ownership, false));
    }
    if (ownership !== "owned") {
      return this.#blindCancelFailure(
        operation,
        event,
        base,
        mutable,
        "invalidEvent",
      );
    }
    const cancelable = identity.base;
    if (!this.#baseIsCurrent(base)) {
      return this.#cancelFailure(
        operation,
        event,
        cancelable,
        base,
        mutable,
        "staleBase",
      );
    }
    if (cancelable.defaultPrevented) {
      return simpleOutcome(ignored(operation, "alreadyDefaultPrevented", true));
    }

    const selected = this.#captureSelection(base);
    if (selected === null) {
      return this.#cancelFailure(
        operation,
        event,
        cancelable,
        base,
        mutable,
        "selectionUnavailable",
      );
    }
    const { selection, selectionSync } = selected;
    if (selection.order === "collapsed" && operation !== "paste") {
      const cancellation = this.#attemptCancellation(event, cancelable, base);
      mutable.cancellation = cancellation.confirmed ? "confirmed" : "failed";
      if (!cancellation.confirmed || cancellation.stale) {
        return simpleOutcome(
          reconcile(
            operation,
            cancellation.stale ? "staleBase" : "cancellationFailed",
            cancellation.defaultPrevented,
            freezeProgress(mutable),
          ),
        );
      }
      return simpleOutcome(handled(operation, undefined, freezeProgress(mutable)));
    }

    if (operation === "paste") {
      return this.#handlePastePayload(
        event,
        lease,
        cancelable,
        base,
        selectionSync,
        mutable,
      );
    }

    const serialized = serializeClipboardSelection(
      selection,
      base.presentation,
    );
    if (!serialized.ok) {
      return this.#cancelFailure(
        operation,
        event,
        cancelable,
        base,
        mutable,
        "invalidSelection",
      );
    }
    const clipboardData = readClipboardData(event, identity.base.source);
    if (clipboardData === null || !this.#baseIsCurrent(base)) {
      return this.#cancelFailure(
        operation,
        event,
        cancelable,
        base,
        mutable,
        clipboardData === null ? "clipboardUnavailable" : "staleBase",
      );
    }
    if (
      !this.#writeClipboardRepresentations(
        clipboardData,
        serialized.value.plainText,
        serialized.value.html,
        base,
        mutable,
      )
    ) {
      return this.#cancelFailure(
        operation,
        event,
        cancelable,
        base,
        mutable,
        this.#baseIsCurrent(base) ? "clipboardWriteFailed" : "staleBase",
      );
    }

    const cancellation = this.#attemptCancellation(event, cancelable, base);
    mutable.cancellation = cancellation.confirmed ? "confirmed" : "failed";
    if (!cancellation.confirmed || cancellation.stale) {
      return simpleOutcome(
        reconcile(
          operation,
          cancellation.stale ? "staleBase" : "cancellationFailed",
          cancellation.defaultPrevented,
          freezeProgress(mutable),
        ),
      );
    }
    if (operation === "copy") {
      return simpleOutcome(handled("copy", undefined, freezeProgress(mutable)));
    }

    let request;
    try {
      request = cutDeleteRequest(base.delivery, selectionSync);
    } catch {
      return simpleOutcome(
        blocked("cut", "invalidSelection", true, freezeProgress(mutable)),
      );
    }
    return this.#submitMutation("cut", request, lease, mutable);
  }

  #handlePastePayload(
    event: unknown,
    lease: CommandQueueLease,
    cancelable: CancelableEventSnapshot,
    base: CanonicalBase,
    selection: EditorSelectionSync,
    mutable: MutableProgress,
  ): LeasedOutcome {
    const clipboardData = readClipboardData(event, cancelable.source);
    if (clipboardData === null || !this.#baseIsCurrent(base)) {
      return this.#cancelFailure(
        "paste",
        event,
        cancelable,
        base,
        mutable,
        clipboardData === null ? "clipboardUnavailable" : "staleBase",
      );
    }
    const payload = this.#readPastePayload(clipboardData, base, mutable);
    if (!payload.ok) {
      return this.#cancelFailure(
        "paste",
        event,
        cancelable,
        base,
        mutable,
        payload.reason,
      );
    }
    let request;
    try {
      request = pasteInsertRequest(base.delivery, selection, payload.text);
    } catch {
      return this.#cancelFailure(
        "paste",
        event,
        cancelable,
        base,
        mutable,
        payload.source === "plain" ? "invalidPlainText" : "invalidHtml",
      );
    }
    const cancellation = this.#attemptCancellation(event, cancelable, base);
    mutable.cancellation = cancellation.confirmed ? "confirmed" : "failed";
    if (!cancellation.confirmed || cancellation.stale) {
      return simpleOutcome(
        reconcile(
          "paste",
          cancellation.stale ? "staleBase" : "cancellationFailed",
          cancellation.defaultPrevented,
          freezeProgress(mutable),
        ),
      );
    }
    return this.#submitMutation("paste", request, lease, mutable);
  }

  #readPastePayload(
    clipboardData: ClipboardCapability,
    base: CanonicalBase,
    mutable: MutableProgress,
  ):
    | Readonly<{ ok: true; source: "plain" | "html"; text: string }>
    | Readonly<{ ok: false; reason: ClipboardControllerFailureReason }> {
    const typesRead = readDomDataTransferTypes(clipboardData.value);
    const types = typesRead.ok && typesRead.source === clipboardData.source
      ? snapshotMimeTypes(typesRead.value)
      : null;
    mutable.clipboard = "readAttempted";
    if (types === null || !this.#baseIsCurrent(base)) {
      return Object.freeze({
        ok: false,
        reason: this.#baseIsCurrent(base)
          ? "clipboardReadFailed"
          : "staleBase",
      });
    }
    const hasPlain = types.includes(PLAIN_TEXT_MIME);
    const hasHtml = types.includes(HTML_MIME);
    if (!hasPlain && !hasHtml) {
      return Object.freeze({
        ok: false,
        reason: "unsupportedClipboardPayload",
      });
    }
    const source = hasPlain ? "plain" as const : "html" as const;
    const dataRead = readDomDataTransferData(
      clipboardData.value,
      source === "plain" ? PLAIN_TEXT_MIME : HTML_MIME,
    );
    if (!dataRead.ok || dataRead.source !== clipboardData.source) {
      return Object.freeze({ ok: false, reason: "clipboardReadFailed" });
    }
    const value = dataRead.value;
    if (!this.#baseIsCurrent(base)) {
      return Object.freeze({ ok: false, reason: "staleBase" });
    }
    if (typeof value !== "string") {
      return Object.freeze({
        ok: false,
        reason: source === "plain" ? "invalidPlainText" : "invalidHtml",
      });
    }
    if (source === "plain") {
      return Object.freeze({ ok: true, source, text: value });
    }
    const parsed = parseClipboardHtmlToPlainText(value, base.presentation);
    return parsed.ok
      ? Object.freeze({ ok: true, source, text: parsed.value })
      : Object.freeze({ ok: false, reason: "invalidHtml" });
  }

  #writeClipboardRepresentations(
    clipboardData: ClipboardCapability,
    plainText: string,
    html: string,
    base: CanonicalBase,
    mutable: MutableProgress,
  ): boolean {
    if (!this.#baseIsCurrent(base)) return false;
    const cleared = clearDomDataTransferData(clipboardData.value);
    if (!cleared.ok || cleared.source !== clipboardData.source) {
      mutable.clipboard = "writeUncertain";
      return false;
    }
    mutable.clipboard = "cleared";
    if (!this.#baseIsCurrent(base)) return false;
    const plainWritten = setDomDataTransferData(
      clipboardData.value,
      PLAIN_TEXT_MIME,
      plainText,
    );
    if (!plainWritten.ok || plainWritten.source !== clipboardData.source) {
      mutable.clipboard = "writeUncertain";
      return false;
    }
    mutable.clipboard = "plainWritten";
    if (!this.#baseIsCurrent(base)) return false;
    const htmlWritten = setDomDataTransferData(
      clipboardData.value,
      HTML_MIME,
      html,
    );
    if (!htmlWritten.ok || htmlWritten.source !== clipboardData.source) {
      mutable.clipboard = "writeUncertain";
      return false;
    }
    mutable.clipboard = "representationsWritten";
    return this.#baseIsCurrent(base);
  }

  #submitMutation(
    operation: "cut" | "paste",
    request: Parameters<CommandQueueLeasePort<WasmCommandSequenceOutcome>["submitLeased"]>[1],
    lease: CommandQueueLease,
    mutable: MutableProgress,
  ): LeasedOutcome {
    let submission: CommandQueueLeasedSubmission<WasmCommandSequenceOutcome>;
    mutable.command = "uncertain";
    try {
      submission = this.#queuePort.submitLeased(lease, request);
    } catch {
      return simpleOutcome(
        reconcile(operation, "queueFailure", true, freezeProgress(mutable)),
      );
    }
    if (submission.status === "failed") {
      return simpleOutcome(
        reconcile(operation, "queueFailure", true, freezeProgress(mutable)),
      );
    }
    if (submission.status === "rejected") {
      mutable.command = "notAttempted";
      return simpleOutcome(
        reconcile(operation, "queueRejected", true, freezeProgress(mutable)),
      );
    }
    mutable.command = "completed";
    if (!acceptedMutationOutcome(submission.result)) {
      return simpleOutcome(
        blocked(operation, "commandRejected", true, freezeProgress(mutable)),
      );
    }
    const receipt = this.#freshReceiptCandidate(operation, submission.result);
    if (receipt === null) {
      return simpleOutcome(
        reconcile(operation, "receiptUnavailable", true, freezeProgress(mutable)),
      );
    }
    return Object.freeze({
      disposition: handled(operation, submission.sequence, freezeProgress(mutable)),
      receipt,
    });
  }

  #handleBeforeInputLeased(
    event: unknown,
    _lease: CommandQueueLease,
  ): LeasedOutcome {
    const mutable = mutableProgress("untouched", "notAttempted", "notApplicable");
    const base = this.#captureCanonicalBase();
    if (base === null) {
      this.#receipt = undefined;
      return simpleOutcome(
        reconcile("paste", "adapterUnavailable", false, freezeProgress(mutable)),
      );
    }
    const identity = readExpectedEventIdentity(event, "beforeinput");
    if (identity.status === "mismatch") {
      this.#receipt = undefined;
      return simpleOutcome(
        this.#baseIsCurrent(base)
          ? blocked("paste", "invalidEvent", false, freezeProgress(mutable))
          : reconcile("paste", "staleBase", false, freezeProgress(mutable)),
      );
    }
    if (identity.status === "matchedInvalid") {
      const operation = this.#receipt?.operation ?? "paste";
      this.#receipt = undefined;
      return this.#blindCancelFailure(
        operation,
        event,
        base,
        mutable,
        this.#baseIsCurrent(base) ? "invalidEvent" : "staleBase",
      );
    }
    const ownership = classifyDomEventOwnership(base.rendered.host, identity.target);
    if (!this.#baseIsCurrent(base)) {
      const operation = this.#receipt?.operation ?? "paste";
      this.#receipt = undefined;
      return ownership === "owned" || ownership === "invalid"
        ? this.#blindCancelFailure(
            operation,
            event,
            base,
            mutable,
            "staleBase",
          )
        : simpleOutcome(
            reconcile(operation, "staleBase", false, freezeProgress(mutable)),
          );
    }
    if (ownership === "outsideHost" || ownership === "nestedControl") {
      return simpleOutcome(ignored("paste", ownership, false));
    }
    if (ownership !== "owned") {
      const operation = this.#receipt?.operation ?? "paste";
      this.#receipt = undefined;
      return this.#blindCancelFailure(
        operation,
        event,
        base,
        mutable,
        "invalidEvent",
      );
    }
    const input = readClipboardInputDetails(event, identity.base);
    if (input === null) {
      const operation = this.#receipt?.operation ?? "paste";
      this.#receipt = undefined;
      return this.#blindCancelFailure(
        operation,
        event,
        base,
        mutable,
        "invalidEvent",
      );
    }
    if (!this.#baseIsCurrent(base)) {
      const operation =
        clipboardOperationForInputType(input.inputType) ??
        this.#receipt?.operation ??
        "paste";
      this.#receipt = undefined;
      return this.#cancelFailure(
        operation,
        event,
        input,
        base,
        mutable,
        "staleBase",
      );
    }
    const operation = clipboardOperationForInputType(input.inputType);
    if (operation === null) {
      this.#receipt = undefined;
      return simpleOutcome(ignored("paste", "notClipboardInput", input.defaultPrevented));
    }
    const receipt = this.#receipt;
    this.#receipt = undefined;
    if (
      input.isComposing ||
      receipt?.operation !== operation ||
      receipt.phase !== "beforeinput" ||
      !this.#receiptCandidateIsCurrent(receipt) ||
      receipt.rendered !== base.rendered
    ) {
      return this.#cancelFailure(
        operation,
        event,
        input,
        base,
        mutable,
        "echoWithoutReceipt",
      );
    }
    const cancellation = this.#attemptCancellation(event, input, base);
    mutable.cancellation = cancellation.confirmed ? "confirmed" : "failed";
    if (!cancellation.confirmed || cancellation.stale) {
      return simpleOutcome(
        reconcile(
          operation,
          cancellation.stale ? "staleBase" : "cancellationFailed",
          cancellation.defaultPrevented,
          freezeProgress(mutable),
        ),
      );
    }
    return Object.freeze({
      disposition: Object.freeze({
        kind: "beforeinputEcho",
        operation,
        defaultPrevented: true,
      }),
      receipt: Object.freeze({
        ...receipt,
        phase: "input" as const,
        inputType: input.inputType,
      }),
    });
  }

  #handleInputLeased(event: unknown): LeasedOutcome {
    const mutable = mutableProgress("untouched", "notAttempted", "notApplicable");
    const base = this.#captureCanonicalBase();
    if (base === null) {
      this.#receipt = undefined;
      return simpleOutcome(
        reconcile("paste", "adapterUnavailable", false, freezeProgress(mutable)),
      );
    }
    const identity = readExpectedEventIdentity(event, "input");
    if (identity.status !== "matched") {
      this.#receipt = undefined;
      return simpleOutcome(
        reconcile(
          "paste",
          this.#baseIsCurrent(base) ? "invalidEvent" : "staleBase",
          false,
          freezeProgress(mutable),
        ),
      );
    }
    const ownership = classifyDomEventOwnership(base.rendered.host, identity.target);
    if (!this.#baseIsCurrent(base)) {
      this.#receipt = undefined;
      return simpleOutcome(
        reconcile("paste", "staleBase", false, freezeProgress(mutable)),
      );
    }
    if (ownership === "outsideHost" || ownership === "nestedControl") {
      return simpleOutcome(ignored("paste", ownership, false));
    }
    const input = readClipboardInputDetails(event, identity.base);
    if (ownership !== "owned" || input === null) {
      this.#receipt = undefined;
      return simpleOutcome(
        reconcile("paste", "invalidEvent", false, freezeProgress(mutable)),
      );
    }
    if (!this.#baseIsCurrent(base)) {
      this.#receipt = undefined;
      return simpleOutcome(
        reconcile("paste", "staleBase", input.defaultPrevented, freezeProgress(mutable)),
      );
    }
    const operation = clipboardOperationForInputType(input.inputType);
    if (operation === null) {
      this.#receipt = undefined;
      return simpleOutcome(ignored("paste", "notClipboardInput", input.defaultPrevented));
    }
    const receipt = this.#receipt;
    this.#receipt = undefined;
    if (
      input.isComposing ||
      receipt?.operation !== operation ||
      (receipt.phase === "input" && receipt.inputType !== input.inputType) ||
      !this.#receiptCandidateIsCurrent(receipt) ||
      receipt.rendered !== base.rendered
    ) {
      return simpleOutcome(
        reconcile(operation, "unexpectedInput", input.defaultPrevented, freezeProgress(mutable)),
      );
    }
    return simpleOutcome(
      Object.freeze({ kind: "inputPostcondition", operation }),
    );
  }

  #cancelFailure(
    operation: ClipboardControllerOperation,
    event: unknown,
    cancelable: CancelableEventSnapshot,
    base: CanonicalBase,
    mutable: MutableProgress,
    reason: ClipboardControllerFailureReason,
  ): LeasedOutcome {
    const cancellation = this.#attemptCancellation(event, cancelable, base);
    mutable.cancellation = cancellation.confirmed ? "confirmed" : "failed";
    if (!cancellation.confirmed || cancellation.stale || reason === "staleBase") {
      return simpleOutcome(
        reconcile(
          operation,
          cancellation.stale || reason === "staleBase"
            ? "staleBase"
            : "cancellationFailed",
          cancellation.defaultPrevented,
          freezeProgress(mutable),
        ),
      );
    }
    return simpleOutcome(
      blocked(operation, reason, true, freezeProgress(mutable)),
    );
  }

  #blindCancelFailure(
    operation: ClipboardControllerOperation,
    event: unknown,
    base: CanonicalBase,
    mutable: MutableProgress,
    reason: ClipboardControllerFailureReason,
  ): LeasedOutcome {
    const cancellation = preventDomEventDefault(event);
    const defaultPrevented = cancellation.defaultPrevented;
    const confirmed = cancellation.ok;
    mutable.cancellation = confirmed ? "confirmed" : "failed";
    if (!this.#baseIsCurrent(base)) {
      return simpleOutcome(
        reconcile(
          operation,
          "staleBase",
          defaultPrevented,
          freezeProgress(mutable),
        ),
      );
    }
    return simpleOutcome(
      confirmed
        ? blocked(operation, reason, true, freezeProgress(mutable))
        : reconcile(
            operation,
            "cancellationFailed",
            defaultPrevented,
            freezeProgress(mutable),
          ),
    );
  }

  #attemptCancellation(
    event: unknown,
    snapshot: CancelableEventSnapshot,
    base: CanonicalBase,
  ): CancellationOutcome {
    if (snapshot.defaultPrevented) {
      return Object.freeze({
        confirmed: true,
        defaultPrevented: true,
        stale: !this.#baseIsCurrent(base),
      });
    }
    const cancellation = preventDomEventDefault(event);
    const current = this.#baseIsCurrent(base);
    return Object.freeze({
      confirmed: cancellation.ok,
      defaultPrevented: cancellation.defaultPrevented,
      stale: !current || !this.#baseIsCurrent(base),
    });
  }

  #captureCanonicalBase(): CanonicalBase | null {
    try {
      if (this.#disposed || this.#adapter.state !== "live") return null;
      const rendered = this.#adapter.rendered;
      if (
        !isOwnedRenderedProjection(rendered) ||
        !hostIsNativelyConnected(rendered.host) ||
        !rendered.current ||
        !rendered.validateCanonicalDom()
      ) {
        return null;
      }
      const presentation = projectionPresentation(rendered.projection);
      if (
        projectionProfileDescriptor(rendered.projection) !== undefined &&
        presentation === undefined
      ) {
        return null;
      }
      const delivery = this.#adapter.deliveryToken();
      if (!this.#adapter.acceptsDeliveryToken(delivery)) return null;
      const base = Object.freeze({ rendered, delivery, presentation });
      return this.#baseIsCurrent(base) ? base : null;
    } catch {
      return null;
    }
  }

  #captureSelection(
    base: CanonicalBase,
  ): Readonly<{
    selection: BaseRangeSelection;
    selectionSync: EditorSelectionSync;
  }> | null {
    try {
      const observed = this.#adapter.selectionBridge.read(base.rendered);
      if (
        !observed.ok ||
        observed.value.kind !== "range" ||
        !isOwnedBaseRangeSelection(observed.value.selection) ||
        observed.value.selection.projection !== base.rendered.projection
      ) {
        return null;
      }
      const selection = observed.value.selection;
      const selectionSync = rangeSelectionSync(selection);
      return this.#baseIsCurrent(base)
        ? Object.freeze({ selection, selectionSync })
        : null;
    } catch {
      return null;
    }
  }

  #baseIsCurrent(base: CanonicalBase): boolean {
    try {
      return (
        !this.#disposed &&
        this.#adapter.state === "live" &&
        this.#adapter.rendered === base.rendered &&
        hostIsNativelyConnected(base.rendered.host) &&
        base.rendered.current &&
        base.rendered.validateCanonicalDom() &&
        this.#basePresentationIsCurrent(base) &&
        this.#adapter.acceptsDeliveryToken(base.delivery)
      );
    } catch {
      return false;
    }
  }

  #basePresentationIsCurrent(base: CanonicalBase): boolean {
    const projection = base.rendered.projection;
    return base.presentation === undefined
      ? projectionProfileDescriptor(projection) === undefined &&
          projectionPresentation(projection) === undefined
      : projectionMatchesBrowserPresentation(projection, base.presentation);
  }

  #freshReceiptCandidate(
    operation: "cut" | "paste",
    result: WasmCommandSequenceOutcome,
  ): ReceiptCandidate | null {
    try {
      const rendered = this.#adapter.rendered;
      if (
        result.rendered !== rendered ||
        !isOwnedRenderedProjection(rendered) ||
        !hostIsNativelyConnected(rendered.host) ||
        !rendered.current ||
        !rendered.validateCanonicalDom()
      ) {
        return null;
      }
      const delivery = this.#adapter.deliveryToken();
      return this.#adapter.acceptsDeliveryToken(delivery)
        ? Object.freeze({ operation, rendered, delivery })
        : null;
    } catch {
      return null;
    }
  }

  #receiptCandidateIsCurrent(
    receipt: ReceiptCandidate | EchoReceipt,
  ): boolean {
    try {
      return (
        !this.#disposed &&
        this.#adapter.state === "live" &&
        this.#adapter.rendered === receipt.rendered &&
        hostIsNativelyConnected(receipt.rendered.host) &&
        receipt.rendered.current &&
        receipt.rendered.validateCanonicalDom() &&
        this.#adapter.acceptsDeliveryToken(receipt.delivery)
      );
    } catch {
      return false;
    }
  }
}

function hostIsNativelyConnected(host: HTMLElement): boolean {
  return nativeHtmlHostFacts(host)?.isConnected === true;
}

function readExpectedEventIdentity(
  event: unknown,
  expectedType: string,
): EventIdentitySnapshot {
  if (typeof event !== "object" || event === null) {
    return Object.freeze({ status: "mismatch" });
  }
  const status = readDomEventStatus(event);
  if (status === null || status.type !== expectedType) {
    return Object.freeze({ status: "mismatch" });
  }
  const base = readDomEventBase(event);
  if (base === null || base.source !== status.source) {
    return Object.freeze({ status: "matchedInvalid" });
  }
  return Object.freeze({
    status: "matched" as const,
    target: base.target,
    base,
  });
}

function readClipboardData(
  event: unknown,
  source: DomEventSource,
): ClipboardCapability | null {
  const read = readDomClipboardData(event);
  return read !== null &&
    read.source === source &&
    typeof read.clipboardData === "object" &&
    read.clipboardData !== null
    ? Object.freeze({ source, value: read.clipboardData })
    : null;
}

function readClipboardInputDetails(
  event: unknown,
  base: DomEventBaseSnapshot,
): (CancelableEventSnapshot & Readonly<{
  inputType: string;
  isComposing: boolean;
}>) | null {
  const input = readDomInputEvent(event);
  return input !== null && input.source === base.source
    ? Object.freeze({
        source: base.source,
        cancelable: base.cancelable,
        defaultPrevented: base.defaultPrevented,
        inputType: input.inputType,
        isComposing: input.isComposing,
      })
    : null;
}

function snapshotMimeTypes(value: unknown): readonly string[] | null {
  const snapshot = snapshotOwnDataArray(value, MAX_CLIPBOARD_MIME_TYPES);
  if (snapshot === null) return null;
  const types: string[] = [];
  for (let index = 0; index < snapshot.length; index += 1) {
    const type = snapshot[index];
    if (
      typeof type !== "string" ||
      type.length === 0 ||
      type.length > MAX_CLIPBOARD_MIME_TYPE_UTF16 ||
      type.includes("\0")
    ) {
      return null;
    }
    types.push(asciiLowercase(type));
  }
  return Object.freeze(types);
}

function asciiLowercase(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    result += code >= 65 && code <= 90
      ? String.fromCharCode(code + 32)
      : value[index];
  }
  return result;
}

function clipboardOperationForInputType(
  inputType: string,
): "cut" | "paste" | null {
  if (inputType === "deleteByCut") return "cut";
  return inputType === "insertFromPaste" ||
    inputType === "insertFromPasteAsQuotation"
    ? "paste"
    : null;
}

function acceptedMutationOutcome(result: WasmCommandSequenceOutcome): boolean {
  try {
    return (
      result.status === "delivered" &&
      result.command.status === "committed" &&
      result.command.eventKind === "action"
    );
  } catch {
    return false;
  }
}

function mutableProgress(
  clipboard: ClipboardControllerClipboardState,
  cancellation: MutableProgress["cancellation"],
  command: ClipboardControllerCommandState,
): MutableProgress {
  return { clipboard, cancellation, command };
}

function progress(
  clipboard: ClipboardControllerClipboardState,
  cancellation: ClipboardControllerPartialState["cancellation"],
  command: ClipboardControllerCommandState,
): ClipboardControllerPartialState {
  return Object.freeze({ clipboard, cancellation, command });
}

function freezeProgress(value: MutableProgress): ClipboardControllerPartialState {
  return progress(value.clipboard, value.cancellation, value.command);
}

function handled(
  operation: ClipboardControllerOperation,
  sequence: bigint | undefined,
  partial: ClipboardControllerPartialState,
): ClipboardControllerDisposition {
  return sequence === undefined
    ? Object.freeze({
        kind: "handled",
        operation,
        defaultPrevented: true,
        partial,
      })
    : Object.freeze({
        kind: "handled",
        operation,
        defaultPrevented: true,
        partial,
        sequence,
      });
}

function ignored(
  operation: ClipboardControllerOperation,
  reason: ClipboardControllerIgnoreReason,
  defaultPrevented: boolean,
): ClipboardControllerDisposition {
  return Object.freeze({ kind: "ignored", operation, reason, defaultPrevented });
}

function blocked(
  operation: ClipboardControllerOperation,
  reason: ClipboardControllerFailureReason,
  defaultPrevented: boolean,
  partial: ClipboardControllerPartialState,
): ClipboardControllerDisposition {
  return Object.freeze({
    kind: "blocked",
    operation,
    reason,
    defaultPrevented,
    partial,
  });
}

function reconcile(
  operation: ClipboardControllerOperation,
  reason: ClipboardControllerFailureReason,
  defaultPrevented: boolean,
  partial: ClipboardControllerPartialState,
): ClipboardControllerDisposition {
  return Object.freeze({
    kind: "reconcileRequired",
    operation,
    reason,
    defaultPrevented,
    partial,
  });
}

function simpleOutcome(
  disposition: ClipboardControllerDisposition,
): LeasedOutcome {
  return Object.freeze({ disposition });
}

function operationForDisposition(
  disposition: ClipboardControllerDisposition,
  fallback: ClipboardControllerOperation,
): ClipboardControllerOperation {
  return "operation" in disposition ? disposition.operation : fallback;
}

function defaultPreventedForDisposition(
  disposition: ClipboardControllerDisposition,
): boolean {
  return "defaultPrevented" in disposition
    ? disposition.defaultPrevented
    : false;
}

function partialForDisposition(
  disposition: ClipboardControllerDisposition,
): ClipboardControllerPartialState {
  if ("partial" in disposition) return disposition.partial;
  if (disposition.kind === "beforeinputEcho") {
    return progress("untouched", "confirmed", "notApplicable");
  }
  return progress("untouched", "notAttempted", "notApplicable");
}
