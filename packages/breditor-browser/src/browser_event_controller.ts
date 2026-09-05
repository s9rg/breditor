import { translateBeforeInput } from "./beforeinput.js";
import { translateClipboardCommand, type ClipboardOperation } from "./clipboard_command.js";
import { type CommandQueueSubmission, BreditorCommandQueue } from "./command_queue.js";
import { mapDomTargetRange } from "./dom_target_range.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import {
  editorDeliveryAuthorityAccepts,
  editorDeliveryTokenMatchesRender,
  isEditorDeliveryAuthority,
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  noSelectionSync,
  rangeSelectionSync,
  type EditorCommandRequest,
  type EditorDeliveryAuthority,
  type EditorDeliveryToken,
  type EditorSelectionSync,
} from "./editor_command.js";
import type {
  BrowserEventBlockReason,
  BrowserEventDisposition,
  BrowserEventIgnoreReason,
  BrowserEventReconcileReason,
} from "./event_disposition.js";
import {
  translateKeyDown,
  type KeyboardSnapshot,
  type KeyboardTranslationPolicy,
} from "./keyboard.js";
import {
  isOwnedRenderedProjection,
  type RenderedProjection,
} from "./dom_renderer.js";
import {
  baseSelectionPointsEqual,
  type BaseRangeSelection,
} from "./selection.js";

interface ReceiptBase {
  readonly rendered: RenderedProjection;
  readonly rendererGeneration: bigint;
  readonly delivery: EditorDeliveryToken;
}

interface ClipboardReceipt extends ReceiptBase {
  readonly kind: "clipboard";
  readonly operation: "cut" | "paste";
  readonly phase: "beforeinput" | "input";
}

interface KeyboardReceipt {
  readonly kind: "keyboard";
  readonly fingerprint: string;
  readonly inputTypes: readonly string[];
  readonly phase: "beforeinput" | "input";
  /** Token consumed by the keydown command which created this receipt. */
  readonly delivery: EditorDeliveryToken;
  /** Bound after beforeinput; a direct keydown-to-input echo omits this. */
  readonly rendered?: RenderedProjection;
  readonly rendererGeneration?: bigint;
}

interface EventBase {
  readonly type: string;
  readonly target: EventTarget | null;
  readonly cancelable: boolean;
  readonly defaultPrevented: boolean;
  readonly preventDefault: (this: Event) => void;
}

interface InputEventSnapshot {
  readonly inputType: string;
  readonly data: string | null;
  readonly isComposing: boolean;
}

type TargetRangeSnapshot =
  | Readonly<{ ok: true; count: 0 }>
  | Readonly<{ ok: true; count: 1; range: AbstractRange }>
  | Readonly<{ ok: true; count: "multiple" }>
  | Readonly<{ ok: false }>;

type AcceptedTargetRangeSnapshot = Exclude<TargetRangeSnapshot, Readonly<{ ok: false }>>;

type EventAdmission<TResult> =
  | Readonly<{ ok: true; base: EventBase; rendered: RenderedProjection }>
  | Readonly<{
      ok: false;
      owned: boolean;
      preserveReceipts: boolean;
      disposition: BrowserEventDisposition<TResult>;
    }>;

/** Framework-neutral options for one native-event translator. */
export interface BrowserEventControllerOptions {
  readonly keyboard: KeyboardTranslationPolicy;
  /** Exact bridge shared with the observation/render-owning command adapter. */
  readonly selectionBridge: BreditorDomSelectionBridge;
  /** Opaque live-token authority exposed by that same command adapter. */
  readonly deliveryAuthority: EditorDeliveryAuthority;
  /** v0.0.54 supplies the authoritative composition phase. */
  readonly compositionActive?: () => boolean;
}

/**
 * Controlled browser-event translator over one shared serial command queue.
 *
 * Every method is synchronous and total for hostile JavaScript inputs. Native
 * objects are reduced to bounded scalars and semantic target ranges before a
 * request enters the queue; no Event, DOM node, StaticRange, or DataTransfer is
 * retained. The semantic model remains the sole editing authority.
 */
export class BreditorBrowserEventController<TResult> {
  readonly #queue: BreditorCommandQueue<TResult>;
  readonly #keyboard: KeyboardTranslationPolicy;
  readonly #compositionActive: () => boolean;
  readonly #selectionBridge: BreditorDomSelectionBridge;
  readonly #deliveryAuthority: EditorDeliveryAuthority;
  #clipboardReceipt: ClipboardReceipt | undefined;
  #keyboardReceipt: KeyboardReceipt | undefined;

  constructor(
    queue: BreditorCommandQueue<TResult>,
    options: BrowserEventControllerOptions,
  ) {
    let validQueue = false;
    try {
      validQueue = queue instanceof BreditorCommandQueue;
    } catch {
      // Rejected below.
    }
    if (!validQueue) {
      throw new TypeError("browser event controller requires an owned command queue");
    }
    const snapshot = snapshotControllerOptions(options);
    if (snapshot === null) {
      throw new TypeError("browser event controller options are invalid");
    }
    this.#queue = queue;
    this.#keyboard = snapshot.keyboard;
    this.#selectionBridge = snapshot.selectionBridge;
    this.#deliveryAuthority = snapshot.deliveryAuthority;
    this.#compositionActive = snapshot.compositionActive;
  }

  /** Handles one native `beforeinput`; every owned cancelable mutation is canceled. */
  handleBeforeInput(
    event: InputEvent,
    rendered: RenderedProjection,
    delivery: EditorDeliveryToken,
  ): BrowserEventDisposition<TResult> {
    const admitted = this.admitEvent(event, rendered, delivery, "beforeinput");
    if (!admitted.ok) {
      if (!admitted.preserveReceipts) {
        this.clearReceipts();
      }
      return admitted.disposition;
    }
    const base = admitted.base;
    const input = readInputEventSnapshot(event);
    const compositionActive = this.readCompositionPhase();
    if (input === null || compositionActive === null) {
      this.clearReceipts();
      return this.cancelBlocked(event, base, "invalidEvent");
    }

    let translation = translateBeforeInput(
      input,
      compositionActive,
      delivery,
      noSelectionSync(),
    );
    if (translation.kind === "composition") {
      this.clearReceipts();
      return Object.freeze({
        kind: "compositionPending",
        defaultPrevented: false,
      });
    }
    if (!base.cancelable) {
      this.clearReceipts();
      return reconcile("noncancelableMutation", false);
    }
    if (translation.kind === "invalid") {
      this.clearReceipts();
      return this.cancelBlocked(event, base, "invalidEvent");
    }

    let capturedSelection: EditorSelectionSync | undefined;
    if (translation.kind === "command") {
      capturedSelection = this.captureRangeSelection(admitted.rendered);
      if (capturedSelection === undefined) {
        this.clearReceipts();
        return this.cancelBlocked(event, base, "selectionUnavailable");
      }
      translation = translateBeforeInput(
        input,
        compositionActive,
        delivery,
        capturedSelection,
      );
      if (translation.kind !== "command") {
        this.clearReceipts();
        return this.cancelBlocked(event, base, "invalidEvent");
      }
    }

    const targets = readTargetRanges(event);
    if (!targets.ok) {
      this.clearReceipts();
      return this.cancelBlocked(event, base, "targetRangeUnavailable");
    }
    if (targets.count === "multiple") {
      this.clearReceipts();
      return this.cancelBlocked(event, base, "targetRangeCount");
    }

    if (translation.kind === "clipboardEcho") {
      this.#keyboardReceipt = undefined;
      return this.handleClipboardBeforeInputEcho(
        event,
        base,
        admitted.rendered,
        delivery,
        translation.operation,
        targets,
      );
    }

    const clipboardWasPending = this.#clipboardReceipt !== undefined;
    this.#clipboardReceipt = undefined;
    if (clipboardWasPending) {
      this.#keyboardReceipt = undefined;
    }
    if (translation.kind === "blocked") {
      this.#keyboardReceipt = undefined;
      return this.cancelBlocked(event, base, translation.reason);
    }

    const targetFailure = validateTargetRangeForTranslation(
      admitted.rendered,
      input.inputType,
      targets,
      capturedSelection?.kind === "range" ? capturedSelection.selection : undefined,
    );
    if (targetFailure !== null) {
      this.#keyboardReceipt = undefined;
      return this.cancelBlocked(event, base, targetFailure);
    }

    const keyboardReceipt = this.#keyboardReceipt;
    this.#keyboardReceipt = undefined;
    if (
      keyboardReceipt?.phase === "beforeinput" &&
      keyboardReceipt.inputTypes.includes(input.inputType) &&
      keyboardReceipt.fingerprint === commandFingerprint(translation.request) &&
      keyboardReceipt.delivery.snapshotLineage === delivery.snapshotLineage &&
      delivery.observationEpoch === keyboardReceipt.delivery.observationEpoch + 1n
    ) {
      const canceled = cancelOwnedEvent<TResult>(event, base);
      if (!canceled.ok) {
        return canceled.disposition;
      }
      this.#keyboardReceipt = Object.freeze({
        ...keyboardReceipt,
        phase: "input",
        inputTypes: Object.freeze([input.inputType]),
        rendered: admitted.rendered,
        rendererGeneration: admitted.rendered.rendererGeneration,
      });
      return Object.freeze({
        kind: "keyboardEcho",
        defaultPrevented: true,
        inputType: input.inputType,
      });
    }
    return this.cancelAndSubmit(event, base, translation.request);
  }

  /** Handles explicit shortcuts and the host-selected structural fallback only. */
  handleKeyDown(
    event: KeyboardEvent,
    rendered: RenderedProjection,
    delivery: EditorDeliveryToken,
  ): BrowserEventDisposition<TResult> {
    const admitted = this.admitEvent(event, rendered, delivery, "keydown");
    if (!admitted.ok) {
      if (!admitted.preserveReceipts) {
        this.clearReceipts();
      }
      return admitted.disposition;
    }
    this.clearReceipts();
    const snapshot = readKeyboardSnapshot(event);
    const compositionActive = this.readCompositionPhase();
    if (snapshot === null || compositionActive === null) {
      return this.cancelBlocked(event, admitted.base, "invalidEvent");
    }
    let translation = translateKeyDown(
      snapshot,
      this.#keyboard,
      compositionActive,
      delivery,
      noSelectionSync(),
    );
    if (translation.kind === "composition") {
      return Object.freeze({
        kind: "compositionPending",
        defaultPrevented: false,
      });
    }
    if (translation.kind === "invalid") {
      return this.cancelBlocked(event, admitted.base, "invalidEvent");
    }
    if (translation.kind === "native") {
      return ignored(translation.reason, admitted.base.defaultPrevented);
    }
    if (translation.kind === "blocked") {
      return this.cancelBlocked(event, admitted.base, translation.reason);
    }

    const capturedSelection = this.captureRangeSelection(admitted.rendered);
    if (capturedSelection === undefined) {
      return this.cancelBlocked(event, admitted.base, "selectionUnavailable");
    }
    translation = translateKeyDown(
      snapshot,
      this.#keyboard,
      compositionActive,
      delivery,
      capturedSelection,
    );
    if (translation.kind !== "command") {
      return this.cancelBlocked(event, admitted.base, "invalidEvent");
    }

    const canceled = cancelOwnedEvent<TResult>(event, admitted.base);
    if (!canceled.ok) {
      return canceled.disposition;
    }
    const submission = this.submit(translation.request);
    if (submission.status === "completed" || submission.status === "queued") {
      const inputTypes = keyboardEchoInputTypes(translation.request);
      if (inputTypes.length > 0) {
        this.#keyboardReceipt = Object.freeze({
          kind: "keyboard",
          fingerprint: commandFingerprint(translation.request),
          inputTypes,
          phase: "beforeinput",
          delivery: translation.request.delivery,
        });
      }
    }
    return submissionDisposition(submission);
  }

  /** Stages copy/cut/paste; cut never carries an eager deletion command. */
  handleClipboard(
    event: ClipboardEvent,
    rendered: RenderedProjection,
    delivery: EditorDeliveryToken,
  ): BrowserEventDisposition<TResult> {
    const operation = readClipboardOperation(event);
    if (operation === null) {
      this.clearReceipts();
      return reconcile("eventAccessFailed", false);
    }
    const admitted = this.admitEvent(event, rendered, delivery, operation);
    if (!admitted.ok) {
      if (!admitted.preserveReceipts) {
        this.clearReceipts();
      }
      return admitted.disposition;
    }
    this.clearReceipts();
    const compositionActive = this.readCompositionPhase();
    if (compositionActive === null) {
      return this.cancelBlocked(event, admitted.base, "invalidEvent");
    }
    if (compositionActive) {
      return Object.freeze({
        kind: "compositionPending",
        defaultPrevented: false,
      });
    }
    if (!admitted.base.cancelable) {
      return reconcile("noncancelableMutation", false);
    }

    let request: EditorCommandRequest;
    try {
      const capturedSelection = this.captureRangeSelection(admitted.rendered);
      if (capturedSelection === undefined) {
        return this.cancelBlocked(event, admitted.base, "selectionUnavailable");
      }
      request = translateClipboardCommand(operation, delivery, capturedSelection);
    } catch {
      return this.cancelBlocked(event, admitted.base, "invalidEvent");
    }
    const canceled = cancelOwnedEvent<TResult>(event, admitted.base);
    if (!canceled.ok) {
      return canceled.disposition;
    }
    const submission = this.submit(request);
    if (
      operation !== "copy" &&
      (submission.status === "completed" || submission.status === "queued")
    ) {
      this.#clipboardReceipt = Object.freeze({
        kind: "clipboard",
        operation,
        phase: "beforeinput",
        rendered: admitted.rendered,
        rendererGeneration: admitted.rendered.rendererGeneration,
        delivery,
      });
    }
    return submissionDisposition(submission);
  }

  /** Treats `input` only as a postcondition; it never submits a command. */
  handleInput(
    event: InputEvent,
    rendered: RenderedProjection,
  ): BrowserEventDisposition<TResult> {
    const base = readEventBase(event);
    if (base === null) {
      this.clearReceipts();
      return reconcile("eventAccessFailed", false);
    }
    if (!isOwnedRenderedProjection(rendered)) {
      this.clearReceipts();
      return reconcile("eventAccessFailed", base.defaultPrevented);
    }
    const ownership = eventOwnership(rendered.host, base.target);
    if (ownership === "outsideHost" || ownership === "nestedControl") {
      this.clearReceipts();
      return ignored(ownership, base.defaultPrevented);
    }
    if (ownership === "invalid") {
      this.clearReceipts();
      return reconcile("eventAccessFailed", base.defaultPrevented);
    }
    if (base.type !== "input") {
      this.clearReceipts();
      return reconcile("eventAccessFailed", base.defaultPrevented);
    }

    const input = readInputEventSnapshot(event);
    const compositionActive = this.readCompositionPhase();
    if (input === null || compositionActive === null) {
      this.clearReceipts();
      return reconcile("eventAccessFailed", base.defaultPrevented);
    }
    if (compositionActive || input.isComposing) {
      this.clearReceipts();
      return Object.freeze({
        kind: "compositionPending",
        defaultPrevented: false,
      });
    }

    const clipboardReceipt = this.#clipboardReceipt;
    const keyboardReceipt = this.#keyboardReceipt;
    this.clearReceipts();
    const canonical = rendered.current && rendered.validateCanonicalDom();
    if (!canonical) {
      return reconcile("domDrift", base.defaultPrevented);
    }

    if (
      clipboardReceipt !== undefined &&
      (clipboardReceipt.phase === "beforeinput" || clipboardReceipt.phase === "input") &&
      clipboardReceipt.rendered === rendered &&
      clipboardReceipt.rendererGeneration === rendered.rendererGeneration &&
      clipboardInputTypes(clipboardReceipt.operation).includes(input.inputType)
    ) {
      return Object.freeze({
        kind: "inputPostcondition",
        expectedEcho: Object.freeze({
          kind: "clipboard",
          operation: clipboardReceipt.operation,
        }),
      });
    }
    if (
      keyboardReceipt !== undefined &&
      (keyboardReceipt.phase === "beforeinput" || keyboardReceipt.phase === "input") &&
      keyboardReceipt.inputTypes.includes(input.inputType) &&
      keyboardReceipt.rendered === rendered &&
      keyboardReceipt.rendererGeneration === rendered.rendererGeneration
    ) {
      return Object.freeze({
        kind: "inputPostcondition",
        expectedEcho: Object.freeze({
          kind: "keyboard",
          inputType: input.inputType,
        }),
      });
    }
    return reconcile("unexpectedInput", base.defaultPrevented);
  }

  /** Clears one-use browser echo state, for lifecycle or composition boundaries. */
  forgetEchoReceipts(): void {
    this.clearReceipts();
  }

  private handleClipboardBeforeInputEcho(
    event: InputEvent,
    base: EventBase,
    rendered: RenderedProjection,
    delivery: EditorDeliveryToken,
    operation: "cut" | "paste",
    targets: AcceptedTargetRangeSnapshot,
  ): BrowserEventDisposition<TResult> {
    const receipt = this.#clipboardReceipt;
    this.#clipboardReceipt = undefined;
    if (
      receipt?.phase !== "beforeinput" ||
      receipt.operation !== operation ||
      receipt.rendered !== rendered ||
      receipt.rendererGeneration !== rendered.rendererGeneration ||
      receipt.delivery !== delivery
    ) {
      return this.cancelBlocked(event, base, "clipboardEchoWithoutReceipt");
    }
    if (targets.count === 1 && !mapDomTargetRange(rendered, targets.range).ok) {
      return this.cancelBlocked(event, base, "targetRangeInvalid");
    }
    const canceled = cancelOwnedEvent<TResult>(event, base);
    if (!canceled.ok) {
      return canceled.disposition;
    }
    this.#clipboardReceipt = Object.freeze({ ...receipt, phase: "input" });
    return Object.freeze({
      kind: "clipboardEcho",
      defaultPrevented: true,
      operation,
    });
  }

  private admitEvent(
    event: Event,
    rendered: RenderedProjection,
    delivery: EditorDeliveryToken,
    expectedType: string,
  ): EventAdmission<TResult> {
    if (!editorDeliveryAuthorityAccepts(this.#deliveryAuthority, delivery)) {
      return admissionFailure(
        false,
        true,
        reconcile("deliveryRejected", false),
      );
    }
    const base = readEventBase(event);
    if (base === null) {
      return admissionFailure(
        false,
        false,
        reconcile("eventAccessFailed", false),
      );
    }
    if (!isOwnedRenderedProjection(rendered)) {
      return admissionFailure(
        false,
        false,
        reconcile("eventAccessFailed", base.defaultPrevented),
      );
    }
    const ownership = eventOwnership(rendered.host, base.target);
    if (ownership === "outsideHost" || ownership === "nestedControl") {
      return admissionFailure(
        false,
        false,
        ignored(ownership, base.defaultPrevented),
      );
    }
    if (ownership === "invalid") {
      return admissionFailure(
        true,
        false,
        this.cancelBlocked(event, base, "invalidEvent"),
      );
    }
    if (base.defaultPrevented) {
      return admissionFailure(
        true,
        false,
        ignored("alreadyDefaultPrevented", true),
      );
    }
    let canonical = false;
    try {
      canonical =
        base.type === expectedType &&
        rendered.current &&
        editorDeliveryTokenMatchesRender(delivery, rendered) &&
        rendered.validateCanonicalDom();
    } catch {
      canonical = false;
    }
    if (!canonical) {
      return admissionFailure(
        true,
        false,
        this.cancelBlocked(event, base, "invalidEvent"),
      );
    }
    return Object.freeze({ ok: true, base, rendered });
  }

  private readCompositionPhase(): boolean | null {
    try {
      const active = this.#compositionActive();
      return typeof active === "boolean" ? active : null;
    } catch {
      return null;
    }
  }

  private captureRangeSelection(
    rendered: RenderedProjection,
  ): EditorSelectionSync | undefined {
    try {
      const observed = this.#selectionBridge.read(rendered);
      if (!observed.ok || observed.value.kind !== "range") {
        return undefined;
      }
      return rangeSelectionSync(observed.value.selection);
    } catch {
      return undefined;
    }
  }

  private cancelAndSubmit(
    event: Event,
    base: EventBase,
    request: EditorCommandRequest,
  ): BrowserEventDisposition<TResult> {
    const canceled = cancelOwnedEvent<TResult>(event, base);
    if (!canceled.ok) {
      return canceled.disposition;
    }
    return submissionDisposition(this.submit(request));
  }

  private cancelBlocked(
    event: Event,
    base: EventBase,
    reason: BrowserEventBlockReason,
  ): BrowserEventDisposition<TResult> {
    const canceled = cancelOwnedEvent<TResult>(event, base);
    return canceled.ok
      ? Object.freeze({ kind: "blocked", defaultPrevented: true, reason })
      : canceled.disposition;
  }

  private submit(request: EditorCommandRequest): CommandQueueSubmission<TResult> {
    try {
      return this.#queue.submit(request);
    } catch {
      return Object.freeze({
        status: "failed",
        failure: Object.freeze({
          code: "command_queue.executor_threw",
          sequence: 0n,
        }),
      });
    }
  }

  private clearReceipts(): void {
    this.#clipboardReceipt = undefined;
    this.#keyboardReceipt = undefined;
  }
}

function validateTargetRangeForTranslation(
  rendered: RenderedProjection,
  inputType: string,
  targets: AcceptedTargetRangeSnapshot,
  selection: BaseRangeSelection | undefined,
): BrowserEventBlockReason | null {
  if (inputType === "historyUndo" || inputType === "historyRedo") {
    return targets.count === 0 ? null : "targetRangeCount";
  }
  if (inputType === "insertReplacementText" && targets.count !== 1) {
    return "targetRangeCount";
  }
  if (targets.count === 0) {
    return null;
  }
  if (targets.count === "multiple") {
    return "targetRangeCount";
  }
  const target = mapDomTargetRange(rendered, targets.range);
  if (!target.ok) {
    return "targetRangeInvalid";
  }
  if (
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward"
  ) {
    // Rust owns grapheme deletion semantics; the proposed browser deletion
    // range is validated but never substituted for the semantic action.
    return null;
  }
  if (selection === undefined || selection.projection !== rendered.projection) {
    return "targetRangeMismatch";
  }
  const start = selection.order === "backward" ? selection.focus : selection.anchor;
  const end = selection.order === "backward" ? selection.anchor : selection.focus;
  return baseSelectionPointsEqual(target.value.start, start) &&
    baseSelectionPointsEqual(target.value.end, end)
    ? null
    : "targetRangeMismatch";
}

function readEventBase(event: unknown): EventBase | null {
  try {
    if ((typeof event !== "object" || event === null) && typeof event !== "function") {
      return null;
    }
    const candidate = event as Event;
    const type = candidate.type;
    const target = candidate.target;
    const cancelable = candidate.cancelable;
    const defaultPrevented = candidate.defaultPrevented;
    const preventDefault = candidate.preventDefault;
    if (
      typeof type !== "string" ||
      type.length > 32 ||
      (target !== null && typeof target !== "object") ||
      typeof cancelable !== "boolean" ||
      typeof defaultPrevented !== "boolean" ||
      typeof preventDefault !== "function"
    ) {
      return null;
    }
    return Object.freeze({
      type,
      target,
      cancelable,
      defaultPrevented,
      preventDefault,
    });
  } catch {
    return null;
  }
}

function readInputEventSnapshot(event: unknown): InputEventSnapshot | null {
  try {
    const candidate = event as InputEvent;
    const inputType = candidate.inputType;
    const data = candidate.data;
    const isComposing = candidate.isComposing;
    if (
      typeof inputType !== "string" ||
      inputType.length > 256 ||
      (typeof data !== "string" && data !== null) ||
      (typeof data === "string" && data.length > MAX_BROWSER_COMMAND_TEXT_UTF16) ||
      typeof isComposing !== "boolean"
    ) {
      return null;
    }
    return Object.freeze({ inputType, data, isComposing });
  } catch {
    return null;
  }
}

function readKeyboardSnapshot(event: unknown): KeyboardSnapshot | null {
  try {
    const candidate = event as KeyboardEvent;
    const key = candidate.key;
    const code = candidate.code;
    const altKey = candidate.altKey;
    const ctrlKey = candidate.ctrlKey;
    const metaKey = candidate.metaKey;
    const shiftKey = candidate.shiftKey;
    const repeat = candidate.repeat;
    const isComposing = candidate.isComposing;
    const keyCode = candidate.keyCode;
    const modifierReader = candidate.getModifierState;
    if (typeof modifierReader !== "function") {
      return null;
    }
    const altGraph = Reflect.apply(modifierReader, candidate, ["AltGraph"]);
    if (
      typeof key !== "string" ||
      typeof code !== "string" ||
      key.length > 128 ||
      code.length > 128 ||
      typeof altKey !== "boolean" ||
      typeof ctrlKey !== "boolean" ||
      typeof metaKey !== "boolean" ||
      typeof shiftKey !== "boolean" ||
      typeof repeat !== "boolean" ||
      typeof isComposing !== "boolean" ||
      !Number.isSafeInteger(keyCode) ||
      typeof altGraph !== "boolean"
    ) {
      return null;
    }
    return Object.freeze({
      key,
      code,
      altKey,
      ctrlKey,
      metaKey,
      shiftKey,
      repeat,
      isComposing,
      keyCode,
      altGraph,
    });
  } catch {
    return null;
  }
}

function readTargetRanges(event: unknown): TargetRangeSnapshot {
  try {
    const candidate = event as InputEvent;
    const reader = candidate.getTargetRanges;
    if (typeof reader !== "function") {
      return Object.freeze({ ok: false });
    }
    const ranges: unknown = Reflect.apply(reader, candidate, []);
    if (!Array.isArray(ranges)) {
      return Object.freeze({ ok: false });
    }
    const length = ranges.length;
    if (!Number.isSafeInteger(length) || length < 0) {
      return Object.freeze({ ok: false });
    }
    if (length === 0) {
      return Object.freeze({ ok: true, count: 0 });
    }
    if (length > 1) {
      return Object.freeze({ ok: true, count: "multiple" });
    }
    const descriptor = Object.getOwnPropertyDescriptor(ranges, "0");
    if (descriptor === undefined || !("value" in descriptor)) {
      return Object.freeze({ ok: false });
    }
    return Object.freeze({
      ok: true,
      count: 1,
      range: descriptor.value as AbstractRange,
    });
  } catch {
    return Object.freeze({ ok: false });
  }
}

function cancelOwnedEvent<TResult>(
  event: Event,
  base: EventBase,
):
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; disposition: BrowserEventDisposition<TResult> }> {
  if (!base.cancelable) {
    return Object.freeze({
      ok: false,
      disposition: reconcile<TResult>("noncancelableMutation", false),
    });
  }
  try {
    Reflect.apply(base.preventDefault, event, []);
    const prevented = event.defaultPrevented;
    if (prevented !== true) {
      return Object.freeze({
        ok: false,
        disposition: reconcile<TResult>("preventDefaultFailed", false),
      });
    }
    return Object.freeze({ ok: true });
  } catch {
    return Object.freeze({
      ok: false,
      disposition: reconcile<TResult>("preventDefaultFailed", false),
    });
  }
}

function eventOwnership(
  host: HTMLElement,
  target: EventTarget | null,
): "owned" | "outsideHost" | "nestedControl" | "invalid" {
  try {
    if (!host.isConnected) {
      return "outsideHost";
    }
    if (typeof target !== "object" || target === null) {
      return "outsideHost";
    }
    const node = target as Node;
    if (
      typeof node.nodeType !== "number" ||
      node.ownerDocument !== host.ownerDocument ||
      (node !== host && !host.contains(node))
    ) {
      return "outsideHost";
    }
    let current: Node | null = node;
    while (current !== null && current !== host) {
      if (current.nodeType === 1) {
        const element = current as Element;
        const tag = element.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          tag === "OPTION" ||
          tag === "BUTTON" ||
          element.hasAttribute("contenteditable")
        ) {
          return "nestedControl";
        }
      }
      current = current.parentNode;
    }
    return current === host ? "owned" : "outsideHost";
  } catch {
    return "invalid";
  }
}

function readClipboardOperation(event: unknown): ClipboardOperation | null {
  try {
    const type = (event as Event).type;
    return type === "copy" || type === "cut" || type === "paste" ? type : null;
  } catch {
    return null;
  }
}

function clipboardInputTypes(operation: "cut" | "paste"): readonly string[] {
  return operation === "cut"
    ? Object.freeze(["deleteByCut"])
    : Object.freeze(["insertFromPaste", "insertFromPasteAsQuotation"]);
}

function keyboardEchoInputTypes(request: EditorCommandRequest): readonly string[] {
  const command = request.command;
  if (command.kind === "history") {
    return Object.freeze([
      command.operation === "undo" ? "historyUndo" : "historyRedo",
    ]);
  }
  if (command.kind !== "action") {
    return Object.freeze([]);
  }
  switch (command.actionId) {
    case "breditor/toggle-strong":
      return Object.freeze(["formatBold"]);
    case "breditor/delete-backward":
      return Object.freeze(["deleteContentBackward"]);
    case "breditor/delete-forward":
      return Object.freeze(["deleteContentForward"]);
    case "breditor/insert-paragraph-break":
      return Object.freeze(["insertParagraph"]);
    default:
      return Object.freeze([]);
  }
}

function commandFingerprint(request: EditorCommandRequest): string {
  const command = request.command;
  if (command.kind === "history") {
    return `history:${command.operation}`;
  }
  if (command.kind === "clipboard") {
    return `clipboard:${command.operation}`;
  }
  return command.input.kind === "none"
    ? `action:${command.actionId}:none`
    : `action:${command.actionId}:string:${command.input.value.length}`;
}

function snapshotControllerOptions(
  value: unknown,
): Readonly<{
  keyboard: KeyboardTranslationPolicy;
  selectionBridge: BreditorDomSelectionBridge;
  deliveryAuthority: EditorDeliveryAuthority;
  compositionActive: () => boolean;
}> | null {
  const options = readDataRecordWithOptional(
    value,
    ["keyboard", "selectionBridge", "deliveryAuthority"],
    ["compositionActive"],
  );
  if (options === null) {
    return null;
  }
  const keyboard = snapshotKeyboardPolicy(options["keyboard"]);
  const selectionBridge = options["selectionBridge"];
  const deliveryAuthority = options["deliveryAuthority"];
  const compositionActive = options["compositionActive"] ?? (() => false);
  if (
    keyboard === null ||
    !(selectionBridge instanceof BreditorDomSelectionBridge) ||
    !isEditorDeliveryAuthority(deliveryAuthority) ||
    typeof compositionActive !== "function"
  ) {
    return null;
  }
  return Object.freeze({
    keyboard,
    selectionBridge,
    deliveryAuthority: deliveryAuthority as EditorDeliveryAuthority,
    compositionActive: compositionActive as () => boolean,
  });
}

function snapshotKeyboardPolicy(value: unknown): KeyboardTranslationPolicy | null {
  const policy = readDataRecordWithOptional(
    value,
    ["editing", "primaryModifier", "shortcuts"],
    [],
  );
  if (
    policy === null ||
    (policy["editing"] !== "beforeinputPrimary" &&
      policy["editing"] !== "structuralFallback") ||
    (policy["primaryModifier"] !== "control" &&
      policy["primaryModifier"] !== "meta") ||
    (policy["shortcuts"] !== "enabled" && policy["shortcuts"] !== "disabled")
  ) {
    return null;
  }
  return Object.freeze({
    editing: policy["editing"],
    primaryModifier: policy["primaryModifier"],
    shortcuts: policy["shortcuts"],
  });
}

function readDataRecordWithOptional(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const allowed = new Set([...required, ...optional]);
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length < required.length ||
      ownKeys.length > allowed.size ||
      ownKeys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      required.some((key) => !ownKeys.includes(key))
    ) {
      return null;
    }
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of ownKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || descriptor === undefined || !("value" in descriptor)) {
        return null;
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function submissionDisposition<TResult>(
  submission: CommandQueueSubmission<TResult>,
): BrowserEventDisposition<TResult> {
  if (submission.status === "failed") {
    return reconcile("queueFailure", true);
  }
  if (submission.status === "rejected") {
    return Object.freeze({
      kind: "blocked",
      defaultPrevented: true,
      reason: "queueRejected",
    });
  }
  return Object.freeze({
    kind: "handled",
    defaultPrevented: true,
    submission,
  });
}

function ignored<TResult>(
  reason: BrowserEventIgnoreReason,
  defaultPrevented: boolean,
): BrowserEventDisposition<TResult> {
  return Object.freeze({ kind: "ignored", defaultPrevented, reason });
}

function reconcile<TResult>(
  reason: BrowserEventReconcileReason,
  defaultPrevented: boolean,
): BrowserEventDisposition<TResult> {
  return Object.freeze({
    kind: "reconcileRequired",
    defaultPrevented,
    reason,
  });
}

function admissionFailure<TResult>(
  owned: boolean,
  preserveReceipts: boolean,
  disposition: BrowserEventDisposition<TResult>,
): EventAdmission<TResult> {
  return Object.freeze({ ok: false, owned, preserveReceipts, disposition });
}
