import { translateBeforeInput } from "./beforeinput.js";
import { type CommandQueueSubmission, BreditorCommandQueue } from "./command_queue.js";
import { mapDomTargetRange } from "./dom_target_range.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import { classifyDomEventOwnership } from "./dom_event_ownership.js";
import {
  editorDeliveryAuthorityAccepts,
  editorDeliveryTokenMatchesRender,
  isEditorDeliveryAuthority,
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  noSelectionSync,
  rangeSelectionSync,
  selectionSynchronizationRequest,
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
  BrowserSelectionChangeDisposition,
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
import {
  preventDomEventDefault,
  readDomEventBase,
  readDomInputEvent,
  readDomInputTargetRanges,
  readDomKeyboardEvent,
  type DomEventBaseSnapshot,
} from "./dom_event_intrinsics.js";
import { snapshotOwnDataArray } from "./protected_handle_snapshot.js";

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

type EventBase = DomEventBaseSnapshot;

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
    const admitted = this.#admitEvent(event, rendered, delivery, "beforeinput");
    if (!admitted.ok) {
      if (!admitted.preserveReceipts) {
        this.#clearReceipts();
      }
      return admitted.disposition;
    }
    const base = admitted.base;
    const input = readInputEventSnapshot(event);
    const compositionActive = this.#readCompositionPhase();
    if (input === null || compositionActive === null) {
      this.#clearReceipts();
      return this.#cancelBlocked(event, base, "invalidEvent");
    }

    let translation = translateBeforeInput(
      input,
      compositionActive,
      delivery,
      noSelectionSync(),
    );
    if (translation.kind === "composition") {
      this.#clearReceipts();
      return Object.freeze({
        kind: "compositionPending",
        defaultPrevented: false,
      });
    }
    if (translation.kind === "clipboardEcho") {
      this.#clearReceipts();
      return ignored("clipboardOwns", base.defaultPrevented);
    }
    if (!base.cancelable) {
      this.#clearReceipts();
      return reconcile("noncancelableMutation", false);
    }
    if (translation.kind === "invalid") {
      this.#clearReceipts();
      return this.#cancelBlocked(event, base, "invalidEvent");
    }

    let capturedSelection: EditorSelectionSync | undefined;
    if (translation.kind === "command") {
      capturedSelection = this.#captureRangeSelection(admitted.rendered);
      if (capturedSelection === undefined) {
        this.#clearReceipts();
        return this.#cancelBlocked(event, base, "selectionUnavailable");
      }
      translation = translateBeforeInput(
        input,
        compositionActive,
        delivery,
        capturedSelection,
      );
      if (translation.kind !== "command") {
        this.#clearReceipts();
        return this.#cancelBlocked(event, base, "invalidEvent");
      }
    }

    const targets = readTargetRanges(event);
    if (!targets.ok) {
      this.#clearReceipts();
      return this.#cancelBlocked(event, base, "targetRangeUnavailable");
    }
    if (targets.count === "multiple") {
      this.#clearReceipts();
      return this.#cancelBlocked(event, base, "targetRangeCount");
    }

    if (translation.kind === "blocked") {
      this.#keyboardReceipt = undefined;
      return this.#cancelBlocked(event, base, translation.reason);
    }

    const targetFailure = validateTargetRangeForTranslation(
      admitted.rendered,
      input.inputType,
      targets,
      capturedSelection?.kind === "range" ? capturedSelection.selection : undefined,
    );
    if (targetFailure !== null) {
      this.#keyboardReceipt = undefined;
      return this.#cancelBlocked(event, base, targetFailure);
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
    return this.#cancelAndSubmit(event, base, translation.request);
  }

  /** Handles explicit shortcuts and the host-selected structural fallback only. */
  handleKeyDown(
    event: KeyboardEvent,
    rendered: RenderedProjection,
    delivery: EditorDeliveryToken,
  ): BrowserEventDisposition<TResult> {
    const admitted = this.#admitEvent(event, rendered, delivery, "keydown");
    if (!admitted.ok) {
      if (!admitted.preserveReceipts) {
        this.#clearReceipts();
      }
      return admitted.disposition;
    }
    this.#clearReceipts();
    const snapshot = readKeyboardSnapshot(event);
    const compositionActive = this.#readCompositionPhase();
    if (snapshot === null || compositionActive === null) {
      return this.#cancelBlocked(event, admitted.base, "invalidEvent");
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
      return this.#cancelBlocked(event, admitted.base, "invalidEvent");
    }
    if (translation.kind === "native") {
      return ignored(translation.reason, admitted.base.defaultPrevented);
    }
    if (translation.kind === "blocked") {
      return this.#cancelBlocked(event, admitted.base, translation.reason);
    }

    const capturedSelection = this.#captureRangeSelection(admitted.rendered);
    if (capturedSelection === undefined) {
      return this.#cancelBlocked(event, admitted.base, "selectionUnavailable");
    }
    translation = translateKeyDown(
      snapshot,
      this.#keyboard,
      compositionActive,
      delivery,
      capturedSelection,
    );
    if (translation.kind !== "command") {
      return this.#cancelBlocked(event, admitted.base, "invalidEvent");
    }

    const canceled = cancelOwnedEvent<TResult>(event, admitted.base);
    if (!canceled.ok) {
      return canceled.disposition;
    }
    const submission = this.#submit(translation.request);
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

  /** Treats `input` only as a postcondition; it never submits a command. */
  handleInput(
    event: InputEvent,
    rendered: RenderedProjection,
  ): BrowserEventDisposition<TResult> {
    const base = readEventBase(event);
    if (base === null) {
      this.#clearReceipts();
      return reconcile("eventAccessFailed", false);
    }
    if (!isOwnedRenderedProjection(rendered)) {
      this.#clearReceipts();
      return reconcile("eventAccessFailed", base.defaultPrevented);
    }
    const ownership = classifyDomEventOwnership(rendered.host, base.target);
    if (ownership === "outsideHost" || ownership === "nestedControl") {
      this.#clearReceipts();
      return ignored(ownership, base.defaultPrevented);
    }
    if (ownership === "invalid") {
      this.#clearReceipts();
      return reconcile("eventAccessFailed", base.defaultPrevented);
    }
    if (base.type !== "input") {
      this.#clearReceipts();
      return reconcile("eventAccessFailed", base.defaultPrevented);
    }

    const input = readInputEventSnapshot(event);
    const compositionActive = this.#readCompositionPhase();
    if (input === null || compositionActive === null) {
      this.#clearReceipts();
      return reconcile("eventAccessFailed", base.defaultPrevented);
    }
    if (compositionActive || input.isComposing) {
      this.#clearReceipts();
      return Object.freeze({
        kind: "compositionPending",
        defaultPrevented: false,
      });
    }

    if (isClipboardInputType(input.inputType)) {
      this.#clearReceipts();
      return ignored("clipboardOwns", base.defaultPrevented);
    }

    const keyboardReceipt = this.#keyboardReceipt;
    this.#clearReceipts();
    const canonical = rendered.current && rendered.validateCanonicalDom();
    if (!canonical) {
      return reconcile("domDrift", base.defaultPrevented);
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

  /**
   * Synchronizes a real document `selectionchange` through the shared queue.
   *
   * Missing or outside-host DOM ranges preserve the last semantic selection;
   * they are focus observations, not proof that the core selection is absent.
   */
  handleSelectionChange(
    event: Event,
    rendered: RenderedProjection,
    delivery: EditorDeliveryToken,
  ): BrowserSelectionChangeDisposition<TResult> {
    if (!editorDeliveryAuthorityAccepts(this.#deliveryAuthority, delivery)) {
      return selectionReconcile("deliveryRejected");
    }
    const base = readEventBase(event);
    if (base === null || base.type !== "selectionchange") {
      this.#clearReceipts();
      return selectionBlocked("invalidEvent");
    }
    if (!isOwnedRenderedProjection(rendered)) {
      this.#clearReceipts();
      return selectionReconcile("domDrift");
    }
    let validBase = false;
    let canonical = false;
    try {
      validBase = editorDeliveryTokenMatchesRender(delivery, rendered);
      canonical = rendered.current && rendered.validateCanonicalDom();
    } catch {
      validBase = false;
      canonical = false;
    }
    if (!validBase) {
      return selectionReconcile("deliveryRejected");
    }
    if (!canonical) {
      this.#clearReceipts();
      return selectionReconcile("domDrift");
    }

    const compositionActive = this.#readCompositionPhase();
    if (compositionActive === null) {
      this.#clearReceipts();
      return selectionBlocked("invalidEvent");
    }
    if (compositionActive) {
      this.#clearReceipts();
      return selectionBlocked("compositionActive");
    }

    let observed: ReturnType<BreditorDomSelectionBridge["read"]>;
    try {
      observed = this.#selectionBridge.read(rendered);
    } catch {
      this.#clearReceipts();
      return selectionBlocked("selectionUnavailable");
    }
    if (!observed.ok) {
      this.#clearReceipts();
      return observed.error.code === "selection.dom_drift"
        ? selectionReconcile("domDrift")
        : selectionBlocked("selectionUnavailable");
    }
    if (observed.value.origin === "programmaticEcho") {
      return selectionIgnored("programmaticEcho");
    }
    this.#clearReceipts();
    if (observed.value.kind === "unavailable") {
      return selectionIgnored(observed.value.reason);
    }

    // DOM reads and custom Selection methods are effect boundaries. Reprove
    // the exact adapter/render base before constructing queue work.
    try {
      if (!editorDeliveryAuthorityAccepts(this.#deliveryAuthority, delivery) ||
          !editorDeliveryTokenMatchesRender(delivery, rendered)) {
        return selectionReconcile("deliveryRejected");
      }
      if (!rendered.current || !rendered.validateCanonicalDom()) {
        return selectionReconcile("domDrift");
      }
      const request = selectionSynchronizationRequest(
        delivery,
        observed.value.selection,
        Object.freeze({
          kind: "selectionchange",
          detail: "document-selection",
        }),
      );
      const submission = this.#submit(request);
      if (submission.status === "completed" || submission.status === "queued") {
        return Object.freeze({ kind: "synchronized", submission });
      }
      return submission.status === "failed"
        ? selectionReconcile("queueFailure")
        : selectionBlocked("queueRejected");
    } catch {
      return selectionBlocked("invalidEvent");
    }
  }

  /** Clears one-use browser echo state, for lifecycle or composition boundaries. */
  forgetEchoReceipts(): void {
    this.#clearReceipts();
  }

  #admitEvent(
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
    const ownership = classifyDomEventOwnership(rendered.host, base.target);
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
        this.#cancelBlocked(event, base, "invalidEvent"),
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
        this.#cancelBlocked(event, base, "invalidEvent"),
      );
    }
    return Object.freeze({ ok: true, base, rendered });
  }

  #readCompositionPhase(): boolean | null {
    try {
      const active = this.#compositionActive();
      return typeof active === "boolean" ? active : null;
    } catch {
      return null;
    }
  }

  #captureRangeSelection(
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

  #cancelAndSubmit(
    event: Event,
    base: EventBase,
    request: EditorCommandRequest,
  ): BrowserEventDisposition<TResult> {
    const canceled = cancelOwnedEvent<TResult>(event, base);
    if (!canceled.ok) {
      return canceled.disposition;
    }
    return submissionDisposition(this.#submit(request));
  }

  #cancelBlocked(
    event: Event,
    base: EventBase,
    reason: BrowserEventBlockReason,
  ): BrowserEventDisposition<TResult> {
    const canceled = cancelOwnedEvent<TResult>(event, base);
    return canceled.ok
      ? Object.freeze({ kind: "blocked", defaultPrevented: true, reason })
      : canceled.disposition;
  }

  #submit(request: EditorCommandRequest): CommandQueueSubmission<TResult> {
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

  #clearReceipts(): void {
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
  const snapshot = readDomEventBase(event);
  return snapshot !== null && snapshot.type.length <= 32 ? snapshot : null;
}

function readInputEventSnapshot(event: unknown): InputEventSnapshot | null {
  const snapshot = readDomInputEvent(event);
  if (
    snapshot === null ||
    snapshot.inputType.length > 256 ||
    (typeof snapshot.data === "string" &&
      snapshot.data.length > MAX_BROWSER_COMMAND_TEXT_UTF16)
  ) {
    return null;
  }
  return Object.freeze({
    inputType: snapshot.inputType,
    data: snapshot.data,
    isComposing: snapshot.isComposing,
  });
}

function readKeyboardSnapshot(event: unknown): KeyboardSnapshot | null {
  const snapshot = readDomKeyboardEvent(event);
  if (
    snapshot === null ||
    snapshot.key.length > 128 ||
    snapshot.code.length > 128
  ) {
    return null;
  }
  return Object.freeze({
    key: snapshot.key,
    code: snapshot.code,
    altKey: snapshot.altKey,
    ctrlKey: snapshot.ctrlKey,
    metaKey: snapshot.metaKey,
    shiftKey: snapshot.shiftKey,
    repeat: snapshot.repeat,
    isComposing: snapshot.isComposing,
    keyCode: snapshot.keyCode,
    altGraph: snapshot.altGraph,
  });
}

function readTargetRanges(event: unknown): TargetRangeSnapshot {
  try {
    const read = readDomInputTargetRanges(event);
    if (!read.ok) {
      return Object.freeze({ ok: false });
    }
    if (!Array.isArray(read.value)) {
      return Object.freeze({ ok: false });
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(
      read.value,
      "length",
    );
    if (
      lengthDescriptor === undefined ||
      !("value" in lengthDescriptor) ||
      typeof lengthDescriptor.value !== "number" ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      return Object.freeze({ ok: false });
    }
    const length = lengthDescriptor.value;
    if (length === 0) {
      return Object.freeze({ ok: true, count: 0 });
    }
    if (length > 1) {
      return Object.freeze({ ok: true, count: "multiple" });
    }
    const ranges = snapshotOwnDataArray(read.value, 1);
    if (ranges === null) {
      return Object.freeze({ ok: false });
    }
    return Object.freeze({
      ok: true,
      count: 1,
      range: ranges[0] as AbstractRange,
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
    const cancellation = preventDomEventDefault(event);
    if (!cancellation.ok) {
      return Object.freeze({
        ok: false,
        disposition: reconcile<TResult>(
          "preventDefaultFailed",
          cancellation.defaultPrevented,
        ),
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

function isClipboardInputType(inputType: string): boolean {
  return (
    inputType === "deleteByCut" ||
    inputType === "insertFromPaste" ||
    inputType === "insertFromPasteAsQuotation"
  );
}

function keyboardEchoInputTypes(request: EditorCommandRequest): readonly string[] {
  const command = request.command;
  if (command.kind === "history") {
    return Object.freeze([
      command.operation === "undo" ? "historyUndo" : "historyRedo",
    ]);
  }
  if (command.kind === "control") {
    return Object.freeze([]);
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
  if (command.kind === "control") {
    return `control:${command.operation}`;
  }
  if (command.kind === "selection") {
    return `selection:${command.operation}`;
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

function selectionBlocked<TResult>(
  reason: Extract<
    BrowserSelectionChangeDisposition<TResult>,
    Readonly<{ kind: "blocked" }>
  >["reason"],
): BrowserSelectionChangeDisposition<TResult> {
  return Object.freeze({ kind: "blocked", reason });
}

function selectionIgnored<TResult>(
  reason: Extract<
    BrowserSelectionChangeDisposition<TResult>,
    Readonly<{ kind: "ignored" }>
  >["reason"],
): BrowserSelectionChangeDisposition<TResult> {
  return Object.freeze({ kind: "ignored", reason });
}

function selectionReconcile<TResult>(
  reason: Extract<
    BrowserSelectionChangeDisposition<TResult>,
    Readonly<{ kind: "reconcileRequired" }>
  >["reason"],
): BrowserSelectionChangeDisposition<TResult> {
  return Object.freeze({ kind: "reconcileRequired", reason });
}

function admissionFailure<TResult>(
  owned: boolean,
  preserveReceipts: boolean,
  disposition: BrowserEventDisposition<TResult>,
): EventAdmission<TResult> {
  return Object.freeze({ ok: false, owned, preserveReceipts, disposition });
}
