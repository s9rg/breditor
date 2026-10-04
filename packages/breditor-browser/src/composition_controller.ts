import {
  BreditorCommandQueue,
  BreditorFlatListCommandQueue,
  openFlatListCommandQueueLeasePort,
  openCommandQueueLeasePort,
  type CommandQueueLease,
  type CommandQueueLeasePort,
  type CommandQueueLeasedSubmission,
} from "./command_queue.js";
import type { CompositionDeliveryToken } from "./composition_delivery_token.js";
import { containAsyncRejection } from "./contain_async_rejection.js";
import {
  classifyCompositionEvidence,
  compositionInputType,
  snapshotNativeCompositionEvent,
  snapshotNativeCompositionInput,
  type CompositionEvidence,
  type NativeCompositionInputSnapshot,
} from "./composition_event.js";
import {
  cancelledComposition,
  committedComposition,
  type CompositionAbortReason,
  type CompositionSettlement,
} from "./composition_result.js";
import {
  initialCompositionState,
  reduceCompositionState,
  selectCompositionCandidate,
  type CompositionPhase,
  type CompositionSignal,
  type CompositionState,
} from "./composition_state.js";
import { reconcileCompositionDom, reconcileFlatListCompositionDom } from "./dom_composition_reconcile.js";
import { classifyDomEventOwnership } from "./dom_event_ownership.js";
import {
  preventDomEventDefault,
  readDomEventBase,
  readDomInputTargetRanges,
  readDomKeyboardEvent,
} from "./dom_event_intrinsics.js";
import { nativeHtmlHostFacts } from "./html_host.js";
import {
  isOwnedRenderedProjection,
  isOwnedFlatListRenderedProjection,
  type RenderedProjection,
} from "./dom_renderer.js";
import { BreditorDomSelectionBridge, BreditorFlatListDomSelectionBridge } from "./dom_selection.js";
import { mapDomTargetRange, mapDomFlatListTargetRange } from "./dom_target_range.js";
import {
  flatListRangeSelectionSync,
  isEditorDeliveryAuthority,
  rangeSelectionSync,
  type EditorDeliveryToken,
  type FlatListEditorDeliveryToken,
  type EditorCommandRequest,
  type FlatListEditorCommandRequest,
  type EditorDeliveryAuthority,
} from "./editor_command.js";
import {
  BaseRangeSelection,
  spatialPositionForPoint,
} from "./selection.js";
import {
  type BreditorWasmCommandAdapter,
  type BreditorFlatListWasmCommandAdapter,
  type WasmRenderReconciliationOutcome,
  type WasmCommandSequenceOutcome,
  type WasmCompositionLeaseRestoreOutcome,
} from "./wasm_command_adapter.js";
import { snapshotOwnDataArray } from "./protected_handle_snapshot.js";

import { astPathsEqual } from "./ast_path.js";
import type { BaseDocumentProjection } from "./projection.js";
import type { FlatListDocumentProjection } from "./flat_list_projection.js";
import { FlatListRangeSelection, isOwnedFlatListRangeSelection, flatListSpatialPositionForPoint } from "./flat_list_selection.js";
import { nativeCommandBuilder } from "./native_command_builder.js";

type CompositionProjection = BaseDocumentProjection | FlatListDocumentProjection;
type Delivery<P extends CompositionProjection> = P extends FlatListDocumentProjection ? FlatListEditorDeliveryToken : EditorDeliveryToken;
type Selection<P extends CompositionProjection> = P extends FlatListDocumentProjection ? FlatListRangeSelection : BaseRangeSelection;
type Request<P extends CompositionProjection> = P extends FlatListDocumentProjection ? FlatListEditorCommandRequest : EditorCommandRequest;

/** A completed, non-queued Rust composition delivery. */
export interface CompositionCommandSubmission<P extends CompositionProjection = BaseDocumentProjection> {
  readonly status: "completed";
  readonly sequence: bigint;
  readonly result: WasmCommandSequenceOutcome<P>;
}

/** A fresh canonical browser base from which the caller may resume routing. */
export interface CompositionControllerResume<P extends CompositionProjection = BaseDocumentProjection> {
  readonly rendered: RenderedProjection<P>;
  readonly delivery: Delivery<P>;
}

/** Stable inert reasons which never expose event or composition payloads. */
export type CompositionControllerIgnoreReason =
  | "inactive"
  | "notComposition"
  | "outsideHost"
  | "nestedControl"
  | "alreadyDefaultPrevented";

/** Terminal result of one synchronous or task-boundary settlement. */
export type CompositionControllerTerminal<P extends CompositionProjection = BaseDocumentProjection> =
  | Readonly<{
      kind: "settled";
      settlement: CompositionSettlement<CompositionCommandSubmission<P>>;
      resume: CompositionControllerResume<P>;
    }>
  | Readonly<{
      kind: "recoveryRequired";
      reason: CompositionAbortReason;
    }>;

/** Successful canonical recovery reported after an earlier quarantine. */
export interface CompositionControllerRecovery<P extends CompositionProjection = BaseDocumentProjection> {
  readonly kind: "recovered";
  readonly resume: CompositionControllerResume<P>;
}

/** Task-boundary lifecycle notifications emitted by the controller. */
export type CompositionControllerNotification<P extends CompositionProjection = BaseDocumentProjection> =
  | CompositionControllerTerminal<P>
  | CompositionControllerRecovery<P>;

/** Payload-redacted result of front-routing one native composition signal. */
export type CompositionControllerDisposition<P extends CompositionProjection = BaseDocumentProjection> =
  | Readonly<{ kind: "native"; phase: CompositionPhase }>
  | Readonly<{ kind: "scheduled"; phase: "ending" }>
  | Readonly<{ kind: "lateInputEcho" }>
  | Readonly<{ kind: "ignored"; reason: CompositionControllerIgnoreReason }>
  | CompositionControllerRecovery<P>
  | Readonly<{ kind: "disposed" }>
  | CompositionControllerTerminal<P>;

/** Scheduling and observation hooks; neither receives native event payloads. */
export interface CompositionControllerOptions<P extends CompositionProjection = BaseDocumentProjection> {
  /** Enqueue a later task synchronously; promise/thenable returns are invalid. */
  readonly scheduleTask?: (callback: () => void) => void;
  /** Observational only; thrown errors and async rejections are contained. */
  readonly onSettlement?: (result: CompositionControllerNotification<P>) => void;
}

interface AdapterSurface<P extends CompositionProjection> {
  readonly commandExecutor: (
    request: Request<P>,
  ) => WasmCommandSequenceOutcome<P>;
  readonly rendered: RenderedProjection<P>;
  readonly state: BreditorWasmCommandAdapter["state"];
  readonly selectionBridge: BreditorDomSelectionBridge | BreditorFlatListDomSelectionBridge;
  readonly deliveryAuthority: EditorDeliveryAuthority;
  acceptsDeliveryToken(token: unknown): token is Delivery<P>;
  deliveryToken(): Delivery<P>;
  beginCompositionLease(
    delivery: Delivery<P>,
    selection: Selection<P>,
    sessionId: bigint,
  ): CompositionDeliveryToken<P>;
  refineCompositionLease(
    token: CompositionDeliveryToken<P>,
    selection: Selection<P>,
  ): CompositionDeliveryToken<P>;
  openCompositionDomLease(token: CompositionDeliveryToken<P>): boolean;
  restoreCompositionLease(
    token: CompositionDeliveryToken<P>,
  ): WasmCompositionLeaseRestoreOutcome<P>;
  recoverCompositionLease(
    token: CompositionDeliveryToken<P>,
  ): WasmCompositionLeaseRestoreOutcome<P>;
  restoreCanonicalRender(): WasmRenderReconciliationOutcome<P>;
}

interface ActiveSession<P extends CompositionProjection> {
  readonly sessionId: bigint;
  readonly queueLease: CommandQueueLease;
  token: CompositionDeliveryToken<P>;
  selection: Selection<P>;
  restored: CompositionControllerResume<P> | undefined;
}

interface LateInputReceipt<P extends CompositionProjection> {
  readonly sessionId: bigint;
  readonly text: string;
  readonly rendered: RenderedProjection<P>;
  readonly delivery: Delivery<P>;
}

type TargetRangeSnapshot =
  | Readonly<{ ok: true; range: AbstractRange }>
  | Readonly<{ ok: false }>;

type KeySnapshot = Readonly<{
  target: EventTarget | null;
  key: string;
  code: string;
  isComposing: boolean;
  keyCode: number;
  defaultPrevented: boolean;
}>;

const defaultScheduleTask = (callback: () => void): void => {
  globalThis.setTimeout(callback, 20);
};

/**
 * Owns one native IME interval across DOM mutation, queue serialization, and
 * exact Rust command delivery. Native events and target ranges are reduced to
 * immutable semantic values synchronously and are never retained.
 */
class CompositionControllerCore<P extends CompositionProjection> {
  readonly #queuePort: CommandQueueLeasePort<WasmCommandSequenceOutcome<P>, Request<P>>;
  readonly #adapter: AdapterSurface<P>;
  readonly #flatLists: boolean;
  readonly #scheduleTask: (callback: () => void) => void;
  readonly #onSettlement:
    | ((result: CompositionControllerNotification<P>) => void)
    | undefined;
  #state: CompositionState = initialCompositionState();
  #active: ActiveSession<P> | undefined;
  #lateInput: LateInputReceipt<P> | undefined;

  constructor(
    queue: BreditorCommandQueue<WasmCommandSequenceOutcome<P>> | BreditorFlatListCommandQueue<WasmCommandSequenceOutcome<P>>,
    adapter: BreditorWasmCommandAdapter | BreditorFlatListWasmCommandAdapter,
    options: CompositionControllerOptions<P>,
    flatLists: boolean,
  ) {
    if (!(flatLists ? queue instanceof BreditorFlatListCommandQueue : queue instanceof BreditorCommandQueue)) {
      throw new TypeError("composition queue is invalid");
    }
    const surface = adapter as unknown as AdapterSurface<P>;
    let adapterValid = false;
    let executor: AdapterSurface<P>["commandExecutor"] | undefined;
    try {
      executor = surface.commandExecutor;
      adapterValid =
        typeof executor === "function" &&
        surface.commandExecutor === executor &&
        (flatLists ? surface.selectionBridge instanceof BreditorFlatListDomSelectionBridge : surface.selectionBridge instanceof BreditorDomSelectionBridge) &&
        isEditorDeliveryAuthority(surface.deliveryAuthority) &&
        (flatLists ? isOwnedFlatListRenderedProjection(surface.rendered) : isOwnedRenderedProjection(surface.rendered)) &&
        typeof surface.deliveryToken === "function" &&
        typeof surface.acceptsDeliveryToken === "function" &&
        typeof surface.beginCompositionLease === "function" &&
        typeof surface.refineCompositionLease === "function" &&
        typeof surface.openCompositionDomLease === "function" &&
        typeof surface.restoreCompositionLease === "function" &&
        typeof surface.recoverCompositionLease === "function" &&
        typeof surface.restoreCanonicalRender === "function";
    } catch {
      adapterValid = false;
    }
    if (!adapterValid || executor === undefined) {
      throw new TypeError("composition adapter is invalid");
    }
    const queuePort = (flatLists && queue instanceof BreditorFlatListCommandQueue
      ? openFlatListCommandQueueLeasePort(queue, executor as (request: FlatListEditorCommandRequest) => WasmCommandSequenceOutcome<P>)
      : !flatLists && queue instanceof BreditorCommandQueue
        ? openCommandQueueLeasePort(queue, executor as (request: EditorCommandRequest) => WasmCommandSequenceOutcome<P>) : undefined
    ) as CommandQueueLeasePort<WasmCommandSequenceOutcome<P>, Request<P>> | undefined;
    if (queuePort === undefined) {
      throw new TypeError("composition queue must own the adapter executor");
    }
    const optionScheduleTask = options.scheduleTask;
    const optionObserver = options.onSettlement;
    const scheduleTask = optionScheduleTask ?? defaultScheduleTask;
    if (typeof scheduleTask !== "function") {
      throw new TypeError("composition scheduler is invalid");
    }
    if (
      optionObserver !== undefined &&
      typeof optionObserver !== "function"
    ) {
      throw new TypeError("composition settlement observer is invalid");
    }
    this.#flatLists = flatLists;
    this.#queuePort = queuePort;
    this.#adapter = surface;
    this.#scheduleTask = scheduleTask;
    this.#onSettlement = optionObserver;
  }

  /** Current closed state-machine phase. */
  get phase(): CompositionPhase {
    return this.#state.phase;
  }

  /** True while any composition or recovery lease still excludes normal work. */
  get active(): boolean {
    return this.#isActive();
  }

  #isActive(): boolean {
    return this.#state.phase !== "idle" && this.#state.phase !== "disposed";
  }

  /** Front-routes compositionstart, compositionupdate, and compositionend. */
  handleCompositionEvent(event: unknown): CompositionControllerDisposition<P> {
    if (this.#state.phase === "disposed") {
      return recovery("disposed");
    }
    const base = readDomEventBase(event);
    if (
      base === null ||
      (base.type !== "compositionstart" &&
        base.type !== "compositionupdate" &&
        base.type !== "compositionend")
    ) {
      return this.#invalidEvent(false);
    }
    const admission = base.type === "compositionstart" && this.#state.phase === "idle"
      ? this.#admitIdleTarget(base.target)
      : this.#admitActiveTarget(base.target);
    if (admission !== null) return admission;
    const snapshot = snapshotNativeCompositionEvent(event);
    if (!snapshot.ok) {
      return this.#invalidEvent(snapshot.error.code === "composition.invalid_text");
    }

    if (snapshot.value.type === "compositionstart") {
      if (snapshot.value.defaultPrevented) return ignored("alreadyDefaultPrevented");
      if (this.#state.phase === "idle") {
        const started = this.#start("start");
        if (started !== null) {
          this.#preventNativeEvent(event, snapshot.value.cancelable);
        }
        return started ?? native(this.#state.phase);
      }
      if (
        (this.#state.phase === "armed" ||
          this.#state.phase === "leased" ||
          this.#state.phase === "mutating") &&
        this.#state.startMode === "implicit" &&
        !this.#state.explicitStartObserved
      ) {
        const confirmed = reduceCompositionState(this.#state, {
          kind: "confirmStart",
        });
        if (confirmed.ok) {
          this.#state = confirmed.value.state;
          return native(this.#state.phase);
        }
      }
      return this.#quarantine("invalidTransition");
    }

    if (snapshot.value.defaultPrevented) return ignored("alreadyDefaultPrevented");
    if (this.#active === undefined) return recovery("orphanInput");
    if (
      this.#state.phase !== "mutating" &&
      this.#state.phase !== "ending" &&
      this.#state.phase !== "leased"
    ) {
      return this.#quarantine("unexpectedMutation");
    }

    const evidence = classifyCompositionEvidence(snapshot.value);
    if (evidence !== null && !this.#recordEvidence(evidence)) {
      return this.#quarantine("invalidTransition");
    }
    if (snapshot.value.type !== "compositionend") {
      return native(this.#state.phase);
    }
    return this.#end("end");
  }

  /** Front-routes only composition-related beforeinput before native mutation. */
  handleBeforeInput(event: unknown): CompositionControllerDisposition<P> {
    if (this.#state.phase === "disposed") return recovery("disposed");
    const base = readDomEventBase(event);
    if (base === null || base.type !== "beforeinput") {
      return this.#invalidEvent(false);
    }
    if (this.#isActive()) {
      const admission = this.#admitActiveTarget(base.target);
      if (admission !== null) return admission;
    }
    const snapshot = snapshotNativeCompositionInput(event);
    if (!snapshot.ok) {
      return this.#invalidEvent(snapshot.error.code === "composition.invalid_text");
    }
    if (snapshot.value.type !== "beforeinput") return this.#invalidEvent(false);
    const inputType = compositionInputType(snapshot.value.inputType);
    const quirk =
      isCompositionInputQuirk(snapshot.value.inputType) &&
      (this.#isActive() || snapshot.value.isComposing);
    if (inputType === null && !quirk) {
      if (!this.#isActive()) {
        this.#invalidateLateInputForOwnedIdleTarget(base.target);
        return ignored("notComposition");
      }
      this.#preventInvalidBeforeInput(event, snapshot.value);
      return this.#quarantine("unexpectedMutation");
    }
    if (this.#state.phase === "idle") {
      const admission = this.#admitIdleTarget(base.target);
      if (admission !== null) return admission;
      if (snapshot.value.defaultPrevented) return ignored("alreadyDefaultPrevented");
      const started = this.#start("implicitStart");
      if (started !== null) {
        this.#preventInvalidBeforeInput(event, snapshot.value);
        return started;
      }
    } else {
      if (snapshot.value.defaultPrevented) return ignored("alreadyDefaultPrevented");
    }

    if (this.#state.phase === "leased") {
      const opened = this.#refineAndOpen(event);
      if (opened !== null) {
        this.#preventInvalidBeforeInput(event, snapshot.value);
        return opened;
      }
    } else if (
      this.#state.phase !== "mutating" &&
      this.#state.phase !== "ending"
    ) {
      this.#preventInvalidBeforeInput(event, snapshot.value);
      return this.#quarantine("invalidTransition");
    }

    const evidence = compositionInputEvidence(snapshot.value, quirk);
    if (evidence !== null && !this.#recordEvidence(evidence)) {
      this.#preventInvalidBeforeInput(event, snapshot.value);
      return this.#quarantine("invalidTransition");
    }
    if (evidence?.grade === "final") {
      return this.#end("definitiveEnd");
    }
    return native(this.#state.phase);
  }

  /** Front-routes composition input and consumes at most one late terminal echo. */
  handleInput(event: unknown): CompositionControllerDisposition<P> {
    if (this.#state.phase === "disposed") return recovery("disposed");
    const base = readDomEventBase(event);
    if (base === null || base.type !== "input") return this.#invalidEvent(false);
    if (this.#isActive()) {
      const admission = this.#admitActiveTarget(base.target);
      if (admission !== null) return admission;
    }
    const snapshot = snapshotNativeCompositionInput(event);
    if (!snapshot.ok) {
      return this.#invalidEvent(snapshot.error.code === "composition.invalid_text");
    }
    if (snapshot.value.type !== "input") return this.#invalidEvent(false);
    const standardInputType = compositionInputType(snapshot.value.inputType);
    const quirk =
      isCompositionInputQuirk(snapshot.value.inputType) &&
      (this.#isActive() || snapshot.value.isComposing || this.#lateInput !== undefined);
    if (standardInputType === null && !quirk) {
      return this.#isActive()
        ? this.#quarantine("unexpectedMutation")
        : ignored("notComposition");
    }
    if (this.#state.phase === "idle") {
      const admission = this.#admitIdleTarget(base.target);
      if (admission !== null) return admission;
      if (snapshot.value.defaultPrevented) return ignored("alreadyDefaultPrevented");
      const evidence = compositionInputEvidence(snapshot.value, quirk);
      const receipt = this.#lateInput;
      if (
        receipt !== undefined &&
        this.#matchesLateInputBase(receipt) &&
        evidence?.grade === "final" &&
        (evidence.text === receipt.text ||
          (receipt.text.length === 0 && evidence.text === null))
      ) {
        this.#lateInput = undefined;
        return Object.freeze({ kind: "lateInputEcho" });
      }
      if (receipt !== undefined) this.#lateInput = undefined;
      return recovery("orphanInput");
    }

    if (snapshot.value.defaultPrevented) return ignored("alreadyDefaultPrevented");
    if (this.#state.phase !== "mutating" && this.#state.phase !== "ending") {
      return this.#quarantine("unexpectedMutation");
    }
    const evidence = compositionInputEvidence(snapshot.value, quirk);
    if (evidence === null || !this.#recordEvidence(evidence)) {
      return this.#quarantine("invalidTransition");
    }
    return evidence.grade === "final" || (quirk && !snapshot.value.isComposing)
      ? this.#end("definitiveEnd")
      : native(this.#state.phase);
  }

  /** An owned keydown after terminal evidence may synchronously settle first. */
  handleKeyDown(event: unknown): CompositionControllerDisposition<P> {
    if (this.#state.phase === "disposed") return recovery("disposed");
    const key = snapshotKeyDown(event);
    if (key === null) return this.#invalidEvent(false);
    if (this.#state.phase === "idle") {
      this.#invalidateLateInputForOwnedIdleTarget(key.target);
      return ignored("inactive");
    }
    const admission = this.#admitActiveTarget(key.target);
    if (admission !== null) return admission;
    if (key.defaultPrevented) return ignored("alreadyDefaultPrevented");
    if (this.#state.phase !== "ending") return native(this.#state.phase);
    const transition = reduceCompositionState(this.#state, { kind: "exitKey" });
    if (!transition.ok) return this.#quarantine("invalidTransition");
    this.#state = transition.value.state;
    return transition.value.effect === "requestSettlement"
      ? this.#settle()
      : native(this.#state.phase);
  }

  /** Blur ends a lease, but changed DOM without final evidence cannot commit. */
  handleBlur(event: unknown): CompositionControllerDisposition<P> {
    if (this.#state.phase === "disposed") return recovery("disposed");
    const basic = snapshotBasicEvent(event, "blur");
    if (basic === null) return this.#invalidEvent(false);
    if (this.#state.phase === "idle") return ignored("inactive");
    const admission = this.#admitActiveTarget(basic.target);
    if (admission !== null) return admission;
    if (basic.defaultPrevented) return ignored("alreadyDefaultPrevented");
    return this.#end("blur");
  }

  /** Attempts canonical restoration, releases the exact queue lease, and exits quarantine. */
  recover(): CompositionControllerDisposition<P> {
    return this.#recover();
  }

  /** Scheduled recovery must use the same implementation, not a public override. */
  #recover(): CompositionControllerDisposition<P> {
    if (this.#state.phase === "disposed") return recovery("disposed");
    if (this.#state.phase !== "quarantined") return ignored("inactive");
    const active = this.#active;
    if (active === undefined) return recovery("uncertain");
    if (this.#queuePort.failure() !== undefined) return recovery("uncertain");
    const resume = this.#restoreForRecovery(active);
    if (resume === undefined) return recovery("uncertain");
    if (!this.#queuePort.releaseLease(active.queueLease)) return recovery("uncertain");
    const transition = reduceCompositionState(this.#state, { kind: "recover" });
    if (!transition.ok) return recovery("uncertain");
    this.#state = transition.value.state;
    this.#active = undefined;
    this.#lateInput = undefined;
    return Object.freeze({ kind: "recovered", resume });
  }

  /** Restores or reconciles owned DOM, releases its queue lease, and becomes inert. */
  dispose(): CompositionControllerDisposition<P> {
    if (this.#state.phase === "disposed") return Object.freeze({ kind: "disposed" });
    const active = this.#active;
    if (active !== undefined) {
      const restored = this.#restoreForRecovery(active);
      if (restored === undefined) return this.#quarantine("uncertain");
      if (!this.#queuePort.releaseLease(active.queueLease)) {
        return this.#quarantine("uncertain");
      }
    }
    const transition = reduceCompositionState(this.#state, { kind: "dispose" });
    this.#state = transition.ok ? transition.value.state : Object.freeze({ phase: "disposed" });
    this.#active = undefined;
    this.#lateInput = undefined;
    return Object.freeze({ kind: "disposed" });
  }

  #start(kind: "start" | "implicitStart"): CompositionControllerDisposition<P> | null {
    const rendered = this.#adapter.rendered;
    let selected: Selection<P>;
    let delivery: Delivery<P>;
    try {
      if (!hostConnected(rendered.host) || !rendered.current || !rendered.validateCanonicalDom()) {
        return recovery("staleBase");
      }
      const observed = this.#readSelection(rendered);
      if (observed === null) {
        return recovery("targetUnavailable");
      }
      selected = observed;
      delivery = this.#adapter.deliveryToken();
    } catch {
      return recovery("staleBase");
    }

    const armed = reduceCompositionState(this.#state, { kind });
    if (!armed.ok || armed.value.state.phase !== "armed") {
      return recovery("invalidTransition");
    }
    const queueLease = this.#queuePort.acquireLease();
    if (queueLease === undefined) return recovery("queueRejected");
    let token: CompositionDeliveryToken<P>;
    try {
      token = this.#adapter.beginCompositionLease(
        delivery,
        selected,
        armed.value.state.sessionId,
      );
    } catch {
      this.#queuePort.releaseLease(queueLease);
      return recovery("staleBase");
    }
    const reserved = reduceCompositionState(armed.value.state, { kind: "reserve" });
    if (!reserved.ok || reserved.value.state.phase !== "leased") {
      try {
        this.#adapter.restoreCompositionLease(token);
      } catch {
        // The state reducer refused its own authorized transition.
      }
      this.#queuePort.releaseLease(queueLease);
      return recovery("uncertain");
    }
    this.#state = reserved.value.state;
    this.#active = {
      sessionId: armed.value.state.sessionId,
      queueLease,
      token,
      selection: selected,
      restored: undefined,
    };
    this.#lateInput = undefined;
    return null;
  }

  #readSelection(rendered: RenderedProjection<P>): Selection<P> | null {
    const bridge = this.#adapter.selectionBridge;
    const observed = this.#flatLists && isOwnedFlatListRenderedProjection(rendered) && bridge instanceof BreditorFlatListDomSelectionBridge
      ? bridge.read(rendered)
      : !this.#flatLists && isOwnedRenderedProjection(rendered) && bridge instanceof BreditorDomSelectionBridge
        ? bridge.read(rendered) : null;
    return observed?.ok && observed.value.kind === "range" ? observed.value.selection as Selection<P> : null;
  }

  #refinedTargetSelection(range: AbstractRange, captured: Selection<P>): Selection<P> | null {
    const rendered = this.#adapter.rendered;
    if (this.#flatLists && isOwnedFlatListRenderedProjection(rendered)) {
      const mapped = mapDomFlatListTargetRange(rendered, range);
      if (!mapped.ok) return null;
      const refined = FlatListRangeSelection.create(rendered.projection, {
        kind: "range", anchor: mapped.value.start, focus: mapped.value.end,
      });
      if (!refined.ok) return null;
      const anchor = flatListSpatialPositionForPoint(rendered.projection, refined.value.anchor);
      const focus = flatListSpatialPositionForPoint(rendered.projection, refined.value.focus);
      if (anchor === null || focus === null || !astPathsEqual(anchor.textBlockPath, focus.textBlockPath)) return null;
      const originalAnchor = flatListSpatialPositionForPoint(rendered.projection, captured.anchor);
      const originalFocus = flatListSpatialPositionForPoint(rendered.projection, captured.focus);
      if (captured.projection === rendered.projection && originalAnchor !== null && originalFocus !== null &&
        astPathsEqual(originalAnchor.textBlockPath, anchor.textBlockPath) &&
        astPathsEqual(originalFocus.textBlockPath, anchor.textBlockPath) &&
        sameCompositionSpan(originalAnchor.utf16Offset, originalFocus.utf16Offset, anchor.utf16Offset, focus.utf16Offset)) {
        return captured;
      }
      return refined.value as Selection<P>;
    }
    if (!this.#flatLists && isOwnedRenderedProjection(rendered)) {
      const mapped = mapDomTargetRange(rendered, range);
      if (!mapped.ok) return null;
      const refined = BaseRangeSelection.create(rendered.projection, {
        kind: "range", anchor: mapped.value.start, focus: mapped.value.end,
      });
      if (!refined.ok) return null;
      const anchor = spatialPositionForPoint(rendered.projection, refined.value.anchor);
      const focus = spatialPositionForPoint(rendered.projection, refined.value.focus);
      if (anchor === null || focus === null || anchor.paragraphIndex !== focus.paragraphIndex) return null;
      const originalAnchor = spatialPositionForPoint(rendered.projection, captured.anchor);
      const originalFocus = spatialPositionForPoint(rendered.projection, captured.focus);
      if (captured.projection === rendered.projection && originalAnchor !== null && originalFocus !== null &&
        originalAnchor.paragraphIndex === anchor.paragraphIndex && originalFocus.paragraphIndex === anchor.paragraphIndex &&
        sameCompositionSpan(originalAnchor.utf16Offset, originalFocus.utf16Offset, anchor.utf16Offset, focus.utf16Offset)) {
        return captured;
      }
      return refined.value as Selection<P>;
    }
    return null;
  }

  #refineAndOpen(event: unknown): CompositionControllerDisposition<P> | null {
    const active = this.#active;
    if (active === undefined || this.#state.phase !== "leased") {
      return this.#quarantine("invalidTransition");
    }
    const target = snapshotSingleTargetRange(event);
    if (!target.ok) return this.#quarantine("targetUnavailable");
    const refined = this.#refinedTargetSelection(target.range, active.selection);
    if (refined === null) return this.#quarantine("targetInvalid");
    try {
      active.token = this.#adapter.refineCompositionLease(
        active.token,
        refined,
      );
      active.selection = refined;
      if (!this.#adapter.openCompositionDomLease(active.token)) {
        return this.#quarantine("staleBase");
      }
    } catch {
      return this.#quarantine("staleBase");
    }
    const opened = reduceCompositionState(this.#state, { kind: "openDom" });
    if (!opened.ok) return this.#quarantine("invalidTransition");
    this.#state = opened.value.state;
    return null;
  }

  #recordEvidence(evidence: CompositionEvidence): boolean {
    const transition = reduceCompositionState(this.#state, {
      kind: "evidence",
      source: evidence.source,
      grade: evidence.grade,
      text: evidence.text,
    });
    if (!transition.ok) return false;
    this.#state = transition.value.state;
    return true;
  }

  #end(kind: "end" | "definitiveEnd" | "blur"): CompositionControllerDisposition<P> {
    const signal: CompositionSignal = { kind };
    const transition = reduceCompositionState(this.#state, signal);
    if (!transition.ok) return this.#quarantine("invalidTransition");
    this.#state = transition.value.state;
    if (transition.value.effect !== "scheduleSettlement") {
      return native(this.#state.phase);
    }
    const active = this.#active;
    if (active === undefined || !this.#schedule(active.sessionId)) {
      return this.#quarantine("uncertain");
    }
    return Object.freeze({ kind: "scheduled", phase: "ending" });
  }

  #schedule(sessionId: bigint): boolean {
    return this.#defer(() => {
      const active = this.#active;
      if (
        active === undefined ||
        active.sessionId !== sessionId ||
        this.#state.phase !== "ending"
      ) {
        return;
      }
      const boundary = reduceCompositionState(this.#state, {
        kind: "taskBoundary",
      });
      const terminal = boundary.ok
        ? (() => {
            this.#state = boundary.value.state;
            return this.#settle();
          })()
        : this.#quarantine("invalidTransition");
      if (terminal.kind === "settled" || terminal.kind === "recoveryRequired") {
        this.#notify(terminal);
      }
    });
  }

  #settle(): CompositionControllerTerminal<P> {
    const active = this.#active;
    if (active === undefined || this.#state.phase !== "settling") {
      return this.#quarantine("invalidTransition");
    }
    if (!hostConnected(active.token.host)) return this.#quarantine("staleBase");
    const reconciled = (this.#flatLists ? reconcileFlatListCompositionDom : reconcileCompositionDom)(
      active.token.host,
      active.token.projection,
      active.selection,
    );
    if (!reconciled.ok) return this.#quarantine("domReconcileFailed");
    const candidate = selectCompositionCandidate(this.#state, {
      originalText: reconciled.value.originalText,
      replacementText: reconciled.value.text,
    });
    if (!candidate.ok) {
      return this.#quarantine(
        candidate.error.code === "composition.candidate_conflict"
          ? "unexpectedMutation"
          : "domReconcileFailed",
      );
    }
    let restored: WasmCompositionLeaseRestoreOutcome<P>;
    try {
      restored = this.#adapter.restoreCompositionLease(active.token);
    } catch {
      return this.#quarantine("staleBase");
    }
    if (!restored.ok) return this.#quarantine("domReconcileFailed");
    active.restored = freezeResume(restored.rendered, restored.delivery);

    let request;
    try {
      const selection = isOwnedFlatListRangeSelection(restored.selection)
        ? flatListRangeSelectionSync(restored.selection) : rangeSelectionSync(restored.selection);
      const builder = nativeCommandBuilder(this.#flatLists, restored.delivery, selection);
      const source = {kind: "beforeinput" as const, detail: candidate.value.kind === "cancel" ? "composition-cancel" : "composition"};
      request = builder.request(source, candidate.value.kind === "cancel"
        ? {kind: "control", operation: "closeHistoryGroup"}
        : candidate.value.kind === "insert"
          ? {kind: "action", actionId: builder.actionIds().insertPlainText, input: {kind: "string", value: candidate.value.text}}
          : {kind: "action", actionId: builder.actionIds().deleteSelection, input: {kind: "none"}},
        candidate.value.kind === "cancel" ? "preserve" : "closeBefore") as Request<P>;
    } catch {
      return this.#quarantine("uncertain");
    }

    // Any delivery attempt can advance or fault the adapter before its queue
    // observer reports failure. The pre-command resume must never authorize
    // recovery after this point.
    active.restored = undefined;
    let submission: CommandQueueLeasedSubmission<WasmCommandSequenceOutcome<P>>;
    try {
      submission = this.#queuePort.submitLeased(
        active.queueLease,
        request,
      );
    } catch {
      return this.#quarantine("uncertain");
    }
    if (submission.status !== "completed") {
      return this.#quarantine(
        submission.status === "rejected" ? "queueRejected" : "uncertain",
      );
    }
    const commandAccepted = candidate.value.kind === "cancel"
      ? submission.result.command.status === "unchanged" ||
        (submission.result.command.status === "committed" &&
          submission.result.command.eventKind === "closeHistoryGroup")
      : submission.result.command.status === "committed" &&
        submission.result.command.eventKind === "action";
    if (!commandAccepted) {
      return this.#quarantine("uncertain");
    }

    let resume: CompositionControllerResume<P>;
    try {
      resume = freezeResume(this.#adapter.rendered, this.#adapter.deliveryToken());
    } catch {
      return this.#quarantine("uncertain");
    }
    active.restored = resume;
    const settlement = candidate.value.kind === "cancel"
      ? cancelledComposition()
      : committedComposition(submission);
    return this.#finish(
      settlement,
      resume,
      active,
      this.#state.latestFinal?.text ?? reconciled.value.text,
    );
  }

  #finish(
    settlement: CompositionSettlement<CompositionCommandSubmission<P>>,
    resume: CompositionControllerResume<P>,
    active: ActiveSession<P>,
    finalText: string,
  ): CompositionControllerTerminal<P> {
    if (!this.#queuePort.releaseLease(active.queueLease)) {
      return this.#quarantine("uncertain");
    }
    const transition = reduceCompositionState(this.#state, { kind: "settled" });
    if (!transition.ok) return this.#quarantine("uncertain");
    this.#state = transition.value.state;
    this.#active = undefined;
    this.#lateInput = Object.freeze({
      sessionId: active.sessionId,
      text: finalText,
      rendered: resume.rendered,
      delivery: resume.delivery,
    });
    this.#scheduleLateInputExpiry(active.sessionId);
    return Object.freeze({ kind: "settled", settlement, resume });
  }

  #invalidEvent(invalidText: boolean): CompositionControllerDisposition<P> {
    return this.#isActive()
      ? this.#quarantine(invalidText ? "invalidText" : "invalidEvent")
      : recovery(invalidText ? "invalidText" : "invalidEvent");
  }

  #admitIdleTarget(target: EventTarget | null): CompositionControllerDisposition<P> | null {
    const rendered = this.#adapter.rendered;
    if (!hostConnected(rendered.host)) return ignored("outsideHost");
    const ownership = classifyDomEventOwnership(rendered.host, target);
    return ownership === "invalid"
      ? recovery("invalidEvent")
      : ownershipDisposition(ownership);
  }

  #admitActiveTarget(target: EventTarget | null): CompositionControllerDisposition<P> | null {
    const active = this.#active;
    if (active === undefined) return recovery("orphanInput");
    if (!hostConnected(active.token.host)) return this.#quarantine("staleBase");
    const ownership = classifyDomEventOwnership(active.token.host, target);
    return ownership === "invalid"
      ? this.#quarantine("invalidEvent")
      : ownershipDisposition(ownership);
  }

  #quarantine(reason: CompositionAbortReason): CompositionControllerTerminal<P> {
    let newlyQuarantined = false;
    if (
      this.#state.phase !== "idle" &&
      this.#state.phase !== "disposed" &&
      this.#state.phase !== "quarantined"
    ) {
      const poisoned = reduceCompositionState(this.#state, { kind: "poison", reason });
      if (poisoned.ok) {
        this.#state = poisoned.value.state;
        newlyQuarantined = true;
      }
    }
    const active = this.#active;
    if (newlyQuarantined && active !== undefined) {
      this.#scheduleRecovery(active.sessionId);
    }
    return recovery(reason);
  }

  #scheduleRecovery(sessionId: bigint): void {
    this.#defer(() => {
      if (
        this.#state.phase !== "quarantined" ||
        this.#active?.sessionId !== sessionId
      ) {
        return;
      }
      const result = this.#recover();
      if (result.kind === "recovered" || result.kind === "recoveryRequired") {
        this.#notify(result);
      }
    });
  }

  #scheduleLateInputExpiry(sessionId: bigint): void {
    if (!this.#defer(() => {
      if (this.#lateInput?.sessionId === sessionId) {
        this.#lateInput = undefined;
      }
    })) {
      this.#lateInput = undefined;
    }
  }

  #matchesLateInputBase(receipt: LateInputReceipt<P>): boolean {
    return this.#resumeIsCurrent(receipt);
  }

  #invalidateLateInputForOwnedIdleTarget(target: EventTarget | null): void {
    if (this.#state.phase !== "idle" || this.#lateInput === undefined) return;
    try {
      const rendered = this.#adapter.rendered;
      if (
        hostConnected(rendered.host) &&
        classifyDomEventOwnership(rendered.host, target) === "owned"
      ) {
        this.#lateInput = undefined;
      }
    } catch {
      // A hostile or stale target cannot invalidate a composition receipt.
    }
  }

  #resumeIsCurrent(resume: CompositionControllerResume<P>): boolean {
    try {
      return (
        this.#adapter.rendered === resume.rendered &&
        resume.rendered.current &&
        resume.rendered.validateCanonicalDom() &&
        this.#adapter.acceptsDeliveryToken(resume.delivery)
      );
    } catch {
      return false;
    }
  }

  #defer(callback: () => void): boolean {
    let scheduling = true;
    let invoked = false;
    let synchronous = false;
    try {
      const returned: unknown = this.#scheduleTask(() => {
        if (invoked) return;
        invoked = true;
        if (scheduling) {
          synchronous = true;
          return;
        }
        callback();
      });
      if (containAsyncRejection(returned)) {
        invoked = true;
        scheduling = false;
        return false;
      }
    } catch {
      // A scheduler may retain the callback before throwing. Revoke that
      // delivery as well as reporting failure; it must not later recover a
      // quarantined composition or release its queue lease.
      invoked = true;
      scheduling = false;
      return false;
    }
    scheduling = false;
    return !synchronous;
  }

  #notify(result: CompositionControllerNotification<P>): void {
    try {
      containAsyncRejection(this.#onSettlement?.(result));
    } catch {
      // Observer failure cannot rewrite an already completed lifecycle result.
    }
  }

  #preventInvalidBeforeInput(
    event: unknown,
    snapshot: NativeCompositionInputSnapshot,
  ): void {
    if (!snapshot.cancelable || snapshot.defaultPrevented) return;
    this.#preventNativeEvent(event, true);
  }

  #preventNativeEvent(event: unknown, cancelable: boolean): void {
    if (!cancelable) return;
    preventDomEventDefault(event);
  }

  #restoreForRecovery(active: ActiveSession<P>): CompositionControllerResume<P> | undefined {
    if (active.restored !== undefined) {
      if (this.#resumeIsCurrent(active.restored)) return active.restored;
      active.restored = undefined;
    }
    try {
      if (this.#adapter.state === "composition") {
        let restored: WasmCompositionLeaseRestoreOutcome<P>;
        try {
          restored = this.#adapter.restoreCompositionLease(active.token);
        } catch {
          restored = this.#adapter.recoverCompositionLease(active.token);
        }
        if (restored.ok) {
          const resume = freezeResume(restored.rendered, restored.delivery);
          active.restored = resume;
          return resume;
        }
      }
    } catch {
      // A spent or externally invalidated lease falls through to reconciliation.
    }
    try {
      const reconciled = this.#adapter.restoreCanonicalRender();
      if (!reconciled.ok) return undefined;
      const resume = freezeResume(reconciled.rendered, this.#adapter.deliveryToken());
      active.restored = resume;
      return resume;
    } catch {
      return undefined;
    }
  }
}

/** Paragraph/heading composition; preserves the existing base-only contract. */
export class BreditorCompositionController extends CompositionControllerCore<BaseDocumentProjection> {
  constructor(queue: BreditorCommandQueue<WasmCommandSequenceOutcome>, adapter: BreditorWasmCommandAdapter,
    options: CompositionControllerOptions = {}) { super(queue, adapter, options, false); }
}

/** Explicit list-mode event scheduling over the shared composition state machine. @internal */
export class BreditorFlatListCompositionController extends CompositionControllerCore<FlatListDocumentProjection> {
  constructor(queue: BreditorFlatListCommandQueue<WasmCommandSequenceOutcome<FlatListDocumentProjection>>,
    adapter: BreditorFlatListWasmCommandAdapter, options: CompositionControllerOptions<FlatListDocumentProjection> = {}) {
    super(queue, adapter, options, true);
  }
}

function isCompositionInputQuirk(inputType: string): boolean {
  return (
    inputType === "insertText" ||
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward"
  );
}

/** Native target ranges have no direction or affinity. Keep both when the
 * captured semantic range names the same spatial span; a genuinely different
 * IME target still replaces the range through normal checked refinement. */
function sameCompositionSpan(anchor: number, focus: number, start: number, end: number): boolean {
  return Math.min(anchor, focus) === Math.min(start, end) && Math.max(anchor, focus) === Math.max(start, end);
}

function compositionInputEvidence(
  snapshot: NativeCompositionInputSnapshot,
  quirk: boolean,
): CompositionEvidence | null {
  const standard = classifyCompositionEvidence(snapshot);
  if (standard !== null || !quirk) return standard;
  return Object.freeze({
    source: snapshot.type,
    grade:
      snapshot.type === "input" && !snapshot.isComposing
        ? "final"
        : "provisional",
    text: snapshot.data,
    inputType: null,
  });
}

function snapshotSingleTargetRange(event: unknown): TargetRangeSnapshot {
  const read = readDomInputTargetRanges(event);
  if (!read.ok) return Object.freeze({ ok: false });
  const ranges = snapshotOwnDataArray(read.value, 1);
  return ranges?.length === 1
    ? Object.freeze({ ok: true, range: ranges[0] as AbstractRange })
    : Object.freeze({ ok: false });
}

function snapshotKeyDown(event: unknown): KeySnapshot | null {
  const base = readDomEventBase(event);
  const key = readDomKeyboardEvent(event);
  return base !== null &&
    key !== null &&
    base.source === key.source &&
    base.type === "keydown"
    ? Object.freeze({
        target: base.target,
        key: key.key,
        code: key.code,
        isComposing: key.isComposing,
        keyCode: key.keyCode,
        defaultPrevented: base.defaultPrevented,
      })
    : null;
}

function snapshotBasicEvent(
  event: unknown,
  expectedType: string,
): Readonly<{ target: EventTarget | null; defaultPrevented: boolean }> | null {
  const snapshot = readDomEventBase(event);
  return snapshot?.type === expectedType
    ? Object.freeze({
        target: snapshot.target,
        defaultPrevented: snapshot.defaultPrevented,
      })
    : null;
}

function ownershipDisposition(
  ownership: ReturnType<typeof classifyDomEventOwnership>,
): ReturnType<typeof ignored> | null {
  if (ownership === "owned") return null;
  return ownership === "nestedControl"
    ? ignored("nestedControl")
    : ignored("outsideHost");
}

function hostConnected(host: HTMLElement): boolean {
  try {
    return nativeHtmlHostFacts(host)?.isConnected === true;
  } catch {
    return false;
  }
}

function freezeResume<P extends CompositionProjection>(
  rendered: RenderedProjection<P>,
  delivery: Delivery<P>,
): CompositionControllerResume<P> {
  return Object.freeze({ rendered, delivery });
}

function native(phase: CompositionPhase): Readonly<{kind: "native"; phase: CompositionPhase}> {
  return Object.freeze({ kind: "native", phase });
}

function ignored(
  reason: CompositionControllerIgnoreReason,
): Readonly<{kind: "ignored"; reason: CompositionControllerIgnoreReason}> {
  return Object.freeze({ kind: "ignored", reason });
}

function recovery(reason: CompositionAbortReason): Readonly<{kind: "recoveryRequired"; reason: CompositionAbortReason}> {
  return Object.freeze({ kind: "recoveryRequired", reason });
}
