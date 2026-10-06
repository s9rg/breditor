import { BreditorBrowserEventController, BreditorFlatListBrowserEventController, BreditorNestedListBrowserEventController } from "./browser_event_controller.js";
import { containAsyncRejection } from "./contain_async_rejection.js";
import { BreditorClipboardController, BreditorFlatListClipboardController, BreditorNestedListClipboardController } from "./clipboard_controller.js";
import { BreditorCommandQueue, BreditorFlatListCommandQueue, BreditorNestedListCommandQueue } from "./command_queue.js";
import {
  BreditorCompositionController,
  BreditorFlatListCompositionController,
  BreditorNestedListCompositionController,
  type CompositionControllerDisposition,
  type CompositionControllerNotification,
} from "./composition_controller.js";
import type {
  BrowserEventDisposition,
  BrowserSelectionChangeDisposition,
} from "./event_disposition.js";
import type { RenderedProjection } from "./dom_renderer.js";
import { nativeHtmlHostFacts } from "./html_host.js";
import type { KeyboardTranslationPolicy } from "./keyboard.js";
import {
  compileCompatibleDefaultKeyboardShortcuts,
  DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
  isOwnedBrowserCompiledKeyboardShortcuts,
  type BrowserCompiledKeyboardShortcuts,
} from "./keyboard_shortcut_profile_contract.js";
import {
  profileDescriptorForAdapter,
  type BreditorWasmCommandAdapter,
  type BreditorFlatListWasmCommandAdapter,
  type BreditorNestedListWasmCommandAdapter,
  type WasmCommandSequenceOutcome,
} from "./wasm_command_adapter.js";

import type { BaseDocumentProjection } from "./projection.js";
import type { FlatListDocumentProjection } from "./flat_list_projection.js";
import type { NestedListDocumentProjection } from "./nested_list_projection.js";
import type { NativeDeliveryToken } from "./native_command_builder.js";

type RouterProjection = BaseDocumentProjection | FlatListDocumentProjection | NestedListDocumentProjection;
type RouterOutcome = WasmCommandSequenceOutcome<RouterProjection>;
type RouterAdapter = BreditorWasmCommandAdapter | BreditorFlatListWasmCommandAdapter | BreditorNestedListWasmCommandAdapter;
type RouterQueue = BreditorCommandQueue<WasmCommandSequenceOutcome> |
  BreditorFlatListCommandQueue<WasmCommandSequenceOutcome<FlatListDocumentProjection>> |
  BreditorNestedListCommandQueue<WasmCommandSequenceOutcome<NestedListDocumentProjection>>;
type RouterComposition = BreditorCompositionController | BreditorFlatListCompositionController | BreditorNestedListCompositionController;

/** Private routing port only; mode-specific controllers still validate every owned input. */
interface OrdinaryRoutePort {
  forgetEchoReceipts(): void;
  handleBeforeInput(event: InputEvent, rendered: RenderedProjection<RouterProjection>, delivery: NativeDeliveryToken): BrowserEventDisposition<RouterOutcome>;
  handleInput(event: InputEvent, rendered: RenderedProjection<RouterProjection>): BrowserEventDisposition<RouterOutcome>;
  handleKeyDown(event: KeyboardEvent, rendered: RenderedProjection<RouterProjection>, delivery: NativeDeliveryToken): BrowserEventDisposition<RouterOutcome>;
  handleSelectionChange(event: Event, rendered: RenderedProjection<RouterProjection>, delivery: NativeDeliveryToken): BrowserSelectionChangeDisposition<RouterOutcome>;
}

/** Maximum distinct lifecycle subscribers retained by one native router. */
export const MAX_BROWSER_EVENT_ROUTER_SUBSCRIBERS = 64;

/** Stable terminal reason exposed without retaining a native event or payload. */
export type BrowserEventRouterFaultReason =
  | "eventDispatchFailed"
  | "queueUncertain"
  | "reconciliationFailed";

/** Minimal observable lifecycle for one installed native-event boundary. */
export type BrowserEventRouterStatus =
  | Readonly<{ kind: "live" }>
  | Readonly<{ kind: "faulted"; reason: BrowserEventRouterFaultReason }>
  | Readonly<{ kind: "disposed" }>;

/** One synchronous lifecycle notification. Native events never escape here. */
export type BrowserEventRouterSubscriber = (
  status: BrowserEventRouterStatus,
) => void;

/** Construction policy for the three package-owned event controllers. */
export interface BrowserEventRouterOptions {
  readonly keyboard: KeyboardTranslationPolicy;
  /** Descriptor-compiled semantic shortcuts; base bindings are the default. */
  readonly keyboardShortcuts?: BrowserCompiledKeyboardShortcuts;
  /** Enqueue a later task synchronously; promise/thenable returns are invalid. */
  readonly scheduleTask?: (callback: () => void) => void;
}

interface SubscriberSlot {
  readonly listener: BrowserEventRouterSubscriber;
  references: number;
}

interface ListenerRegistration {
  readonly target: EventTarget;
  readonly type: string;
  readonly listener: EventListener;
  readonly capture: boolean;
  readonly remove: typeof EventTarget.prototype.removeEventListener;
}

interface TargetListenerIntrinsics {
  readonly add: typeof EventTarget.prototype.addEventListener;
  readonly remove: typeof EventTarget.prototype.removeEventListener;
}

interface ListenerIntrinsics {
  readonly host: TargetListenerIntrinsics;
  readonly document: TargetListenerIntrinsics;
}

type NativeRoute =
  | "composition"
  | "beforeinput"
  | "input"
  | "keydown"
  | "copy"
  | "cut"
  | "paste"
  | "blur"
  | "selectionchange";

const LIVE_STATUS: BrowserEventRouterStatus = Object.freeze({ kind: "live" });
const DISPOSED_STATUS: BrowserEventRouterStatus = Object.freeze({
  kind: "disposed",
});
const NOOP_UNSUBSCRIBE = Object.freeze((): void => {});
const HOST_ROUTERS = new WeakMap<HTMLElement, object>();
const defaultScheduleTask = (callback: () => void): void => {
  globalThis.setTimeout(callback, 0);
};

/**
 * Owns the complete native-listener set for one rendered editor host.
 *
 * Routing is deliberately disposition-based: composition sees relevant input
 * first, clipboard sees only the exact non-composition fallthrough, and the
 * ordinary controller sees only the exact non-clipboard fallthrough. The
 * router never duplicates either controller's input-type translation table.
 */
class BrowserEventRouterCore {
  readonly #ownership = Object.freeze({});
  readonly #queue: RouterQueue;
  readonly #adapter: RouterAdapter;
  readonly #host: HTMLElement;
  readonly #document: Document;
  readonly #listenerIntrinsics: ListenerIntrinsics;
  readonly #scheduleTask: (callback: () => void) => void;
  readonly #ordinary: OrdinaryRoutePort;
  readonly #clipboard: BreditorClipboardController | BreditorFlatListClipboardController | BreditorNestedListClipboardController;
  readonly #composition: RouterComposition;
  readonly #registrations: ListenerRegistration[] = [];
  readonly #subscribers: SubscriberSlot[] = [];
  #status: BrowserEventRouterStatus = LIVE_STATUS;
  #dispatching = false;
  #repairPending = false;
  #repairGeneration = 0;

  readonly #onComposition = (event: Event): void => {
    this.#dispatch("composition", event);
  };
  readonly #onBeforeInput = (event: Event): void => {
    this.#dispatch("beforeinput", event);
  };
  readonly #onInput = (event: Event): void => {
    this.#dispatch("input", event);
  };
  readonly #onKeyDown = (event: Event): void => {
    this.#dispatch("keydown", event);
  };
  readonly #onCopy = (event: Event): void => {
    this.#dispatch("copy", event);
  };
  readonly #onCut = (event: Event): void => {
    this.#dispatch("cut", event);
  };
  readonly #onPaste = (event: Event): void => {
    this.#dispatch("paste", event);
  };
  readonly #onBlur = (event: Event): void => {
    this.#dispatch("blur", event);
  };
  readonly #onSelectionChange = (event: Event): void => {
    this.#dispatch("selectionchange", event);
  };

  constructor(
    queue: RouterQueue,
    adapter: RouterAdapter,
    options: BrowserEventRouterOptions,
    flatLists: boolean | "nested",
  ) {
    if (!(flatLists === "nested" ? queue instanceof BreditorNestedListCommandQueue : flatLists ? queue instanceof BreditorFlatListCommandQueue : queue instanceof BreditorCommandQueue)) {
      throw new TypeError("browser event router queue is invalid");
    }
    const rendered = readInitialRender(adapter);
    if (rendered === null) {
      throw new TypeError("browser event router adapter is invalid");
    }
    const host = rendered.host;
    const ownerDocument = readOwnerDocument(host);
    if (ownerDocument === null) {
      throw new TypeError("browser event router host is invalid");
    }
    const listenerIntrinsics = readListenerIntrinsics(host, ownerDocument);
    if (listenerIntrinsics === null) {
      throw new TypeError("browser event router listener capabilities are invalid");
    }
    if (HOST_ROUTERS.has(host)) {
      throw new TypeError("browser event router host already has an owner");
    }

    // Reserve before inspecting caller-controlled options or constructing a
    // controller. Reentrant construction cannot install a second live router.
    HOST_ROUTERS.set(host, this.#ownership);
    this.#queue = queue;
    this.#adapter = adapter;
    this.#host = host;
    this.#document = ownerDocument;
    this.#listenerIntrinsics = listenerIntrinsics;
    let composition: RouterComposition | undefined;
    let clipboard: BreditorClipboardController | BreditorFlatListClipboardController | BreditorNestedListClipboardController | undefined;
    try {
      const snapshot = snapshotOptions(
        options,
        profileDescriptorForAdapter(adapter),
      );
      if (snapshot === null) {
        throw new TypeError("browser event router options are invalid");
      }
      this.#scheduleTask = snapshot.scheduleTask ?? defaultScheduleTask;
      const scheduled = snapshot.scheduleTask === undefined ? {} : {scheduleTask: snapshot.scheduleTask};
      const compositionOptions = {...scheduled,
        onSettlement: (result: CompositionControllerNotification<RouterProjection>) => this.#handleCompositionNotification(result)};
      const ordinaryOptions = {...scheduled, keyboard: snapshot.keyboard,
        keyboardShortcuts: snapshot.keyboardShortcuts, deliveryAuthority: adapter.deliveryAuthority,
        compositionActive: () => composition?.active === true};
      let ordinary: OrdinaryRoutePort;
      // Select mode exactly once, before listeners can run. Do not infer it
      // from a later event, mutable public property or incoming projection.
      if (flatLists === "nested" && queue instanceof BreditorNestedListCommandQueue) {
        const listAdapter = adapter as BreditorNestedListWasmCommandAdapter;
        composition = new BreditorNestedListCompositionController(queue, listAdapter, compositionOptions);
        clipboard = new BreditorNestedListClipboardController(queue, listAdapter);
        ordinary = new BreditorNestedListBrowserEventController(queue,
          {...ordinaryOptions, selectionBridge: listAdapter.selectionBridge}) as unknown as OrdinaryRoutePort;
      } else if (flatLists === true && queue instanceof BreditorFlatListCommandQueue) {
        const listAdapter = adapter as BreditorFlatListWasmCommandAdapter;
        composition = new BreditorFlatListCompositionController(queue, listAdapter, compositionOptions);
        clipboard = new BreditorFlatListClipboardController(queue, listAdapter);
        ordinary = new BreditorFlatListBrowserEventController(queue,
          {...ordinaryOptions, selectionBridge: listAdapter.selectionBridge}) as unknown as OrdinaryRoutePort;
      } else {
        const baseQueue = queue as BreditorCommandQueue<WasmCommandSequenceOutcome>;
        const baseAdapter = adapter as BreditorWasmCommandAdapter;
        composition = new BreditorCompositionController(baseQueue, baseAdapter, compositionOptions);
        clipboard = new BreditorClipboardController(baseQueue, baseAdapter);
        ordinary = new BreditorBrowserEventController(baseQueue,
          {...ordinaryOptions, selectionBridge: baseAdapter.selectionBridge}) as unknown as OrdinaryRoutePort;
      }

      this.#composition = composition;
      this.#clipboard = clipboard;
      this.#ordinary = ordinary;
      this.#installListeners();
    } catch (error) {
      // Logical invalidation must precede best-effort platform rollback. A
      // patched removeEventListener may fail while retaining a callback.
      if (this.#status.kind === "live") this.#status = DISPOSED_STATUS;
      this.#invalidatePendingRepair();
      this.#removeListeners();
      try {
        clipboard?.dispose();
      } catch {
        // Constructor rollback keeps the original failure authoritative.
      }
      try {
        composition?.dispose();
      } catch {
        // Constructor rollback keeps the original failure authoritative.
      }
      if (HOST_ROUTERS.get(host) === this.#ownership) {
        HOST_ROUTERS.delete(host);
      }
      throw error;
    }
  }

  /** Current immutable lifecycle snapshot. */
  get status(): BrowserEventRouterStatus {
    return this.#status;
  }

  /**
   * Subscribes to the single terminal lifecycle transition.
   *
   * Duplicate functions share one delivery while retaining independent,
   * idempotent unsubscribe closures. Subscriber failures are listener-local.
   */
  subscribe(listener: BrowserEventRouterSubscriber): () => void {
    if (typeof listener !== "function") {
      throw new TypeError("browser event router subscriber must be callable");
    }
    if (this.#status.kind !== "live") return NOOP_UNSUBSCRIBE;

    let slot = this.#subscribers.find((candidate) => candidate.listener === listener);
    if (slot === undefined) {
      if (this.#subscribers.length >= MAX_BROWSER_EVENT_ROUTER_SUBSCRIBERS) {
        throw new RangeError("browser event router subscriber capacity is exhausted");
      }
      slot = { listener, references: 0 };
      this.#subscribers.push(slot);
    }
    slot.references += 1;
    let active = true;
    return Object.freeze((): void => {
      if (!active) return;
      active = false;
      slot.references -= 1;
      if (slot.references !== 0) return;
      const index = this.#subscribers.indexOf(slot);
      if (index !== -1) this.#subscribers.splice(index, 1);
    });
  }

  /** Removes every owned listener and makes every retained callback inert. */
  dispose(): BrowserEventRouterStatus {
    if (this.#status.kind !== "live") {
      // A fault normally removed every listener. Repeat best-effort cleanup to
      // cover an installation hook which installed and then threw.
      this.#removeListeners();
      return this.#status;
    }
    this.#transition(DISPOSED_STATUS);
    return this.#status;
  }

  #installListeners(): void {
    const host = this.#listenerIntrinsics.host;
    const document = this.#listenerIntrinsics.document;
    this.#add(this.#host, "compositionstart", this.#onComposition, false, host);
    this.#add(this.#host, "compositionupdate", this.#onComposition, false, host);
    this.#add(this.#host, "compositionend", this.#onComposition, false, host);
    this.#add(this.#host, "beforeinput", this.#onBeforeInput, false, host);
    this.#add(this.#host, "input", this.#onInput, false, host);
    this.#add(this.#host, "keydown", this.#onKeyDown, false, host);
    this.#add(this.#host, "copy", this.#onCopy, false, host);
    this.#add(this.#host, "cut", this.#onCut, false, host);
    this.#add(this.#host, "paste", this.#onPaste, false, host);
    this.#add(this.#host, "blur", this.#onBlur, true, host);
    this.#add(
      this.#document,
      "selectionchange",
      this.#onSelectionChange,
      false,
      document,
    );
  }

  #add(
    target: EventTarget,
    type: string,
    listener: EventListener,
    capture: boolean,
    intrinsics: TargetListenerIntrinsics,
  ): void {
    const registration = Object.freeze({
      target,
      type,
      listener,
      capture,
      remove: intrinsics.remove,
    });
    // Record rollback before invoking platform code. A patched intrinsic may
    // install, synchronously dispatch into this router, and only then throw.
    this.#registrations.push(registration);
    try {
      Reflect.apply(intrinsics.add, target, [type, listener, capture]);
    } catch (error) {
      if (this.#status.kind === "live") this.#status = DISPOSED_STATUS;
      this.#invalidatePendingRepair();
      this.#removeListeners();
      throw error;
    }
    if (this.#status.kind !== "live") {
      this.#removeListeners();
      throw new TypeError("browser event router terminated during listener installation");
    }
  }

  #removeListeners(): void {
    for (let index = this.#registrations.length - 1; index >= 0; index -= 1) {
      const registration = this.#registrations[index];
      if (registration === undefined) continue;
      try {
        Reflect.apply(registration.remove, registration.target, [
          registration.type,
          registration.listener,
          registration.capture,
        ]);
      } catch {
        // Logical lifecycle invalidation already makes a retained callback inert.
      }
    }
    this.#registrations.length = 0;
  }

  #dispatch(route: NativeRoute, event: Event): void {
    if (this.#status.kind !== "live") return;
    // Node replacement can synchronously terminate Safari's native IME. Only
    // an owned empty compositionend inside our exact restoration window is
    // inert; other reentrant commands still take the ordinary fault path.
    if (route === "composition" && this.#composition.isDomRestorationEcho(event)) return;
    if (this.#dispatching) {
      this.#fault("eventDispatchFailed");
      return;
    }
    if (this.#repairPending) {
      if (!this.#finishPendingRepair()) return;
      // `input` is the post-mutation signal for the unsafe native event which
      // requested this repair. Restoring consumes it; routing it again would
      // manufacture a second unexpected-input reconciliation.
      if (route === "input") return;
    }
    this.#dispatching = true;
    try {
      switch (route) {
        case "composition":
          this.#afterComposition(this.#composition.handleCompositionEvent(event));
          return;
        case "beforeinput":
          this.#routeBeforeInput(event);
          return;
        case "input":
          this.#routeInput(event);
          return;
        case "keydown":
          this.#routeKeyDown(event);
          return;
        case "copy":
          this.#afterClipboard(this.#clipboard.handleCopy(event), "copy");
          return;
        case "cut":
          this.#afterClipboard(this.#clipboard.handleCut(event), "cut");
          return;
        case "paste":
          this.#afterClipboard(this.#clipboard.handlePaste(event), "paste");
          return;
        case "blur":
          this.#afterComposition(this.#composition.handleBlur(event));
          return;
        case "selectionchange":
          this.#routeSelectionChange(event);
          return;
      }
    } catch {
      this.#fault(this.#queueIsUncertain() ? "queueUncertain" : "eventDispatchFailed");
    } finally {
      this.#dispatching = false;
    }
  }

  #routeBeforeInput(event: Event): void {
    const composition = this.#composition.handleBeforeInput(event);
    if (!isNonCompositionDisposition(composition)) {
      this.#afterComposition(composition);
      return;
    }

    const clipboard = this.#clipboard.handleBeforeInput(event);
    if (!isNonClipboardDisposition(clipboard)) {
      this.#afterClipboard(clipboard, "beforeinput");
      return;
    }

    const base = this.#ordinaryBase();
    if (base === null) return;
    this.#afterOrdinary(
      this.#ordinary.handleBeforeInput(
        event as InputEvent,
        base.rendered,
        base.delivery,
      ),
      "beforeinput",
    );
  }

  #routeInput(event: Event): void {
    const composition = this.#composition.handleInput(event);
    if (!isNonCompositionDisposition(composition)) {
      this.#afterComposition(composition);
      return;
    }

    const clipboard = this.#clipboard.handleInput(event);
    if (!isNonClipboardDisposition(clipboard)) {
      this.#afterClipboard(clipboard, "input");
      return;
    }

    const rendered = this.#ordinaryRender();
    if (rendered === null) return;
    this.#afterOrdinary(
      this.#ordinary.handleInput(event as InputEvent, rendered),
      "input",
    );
  }

  #routeKeyDown(event: Event): void {
    const composition = this.#composition.handleKeyDown(event);
    if (!isInactiveCompositionDisposition(composition)) {
      this.#afterComposition(composition);
      return;
    }
    const base = this.#ordinaryBase();
    if (base === null) return;
    this.#afterOrdinary(
      this.#ordinary.handleKeyDown(
        event as KeyboardEvent,
        base.rendered,
        base.delivery,
      ),
      "keydown",
    );
  }

  #routeSelectionChange(event: Event): void {
    // The ordinary controller deliberately rejects every stale delivery token
    // before consulting its composition hook. An active composition has spent
    // the last ordinary token, so a transient document selection observation
    // cannot be represented until the composition controller publishes its
    // fresh resume base.
    if (this.#composition.active) {
      this.#ordinary.forgetEchoReceipts();
      return;
    }
    const base = this.#ordinaryBase();
    if (base === null) return;
    this.#afterSelection(
      this.#ordinary.handleSelectionChange(event, base.rendered, base.delivery),
    );
  }

  #ordinaryRender(): RenderedProjection<RouterProjection> | null {
    const base = this.#ordinaryBase();
    return base?.rendered ?? null;
  }

  #ordinaryBase(): Readonly<{
    rendered: RouterAdapter["rendered"];
    delivery: ReturnType<RouterAdapter["deliveryToken"]>;
  }> | null {
    if (this.#status.kind !== "live") return null;
    if (this.#queueIsUncertain()) {
      this.#fault("queueUncertain");
      return null;
    }
    try {
      if (this.#adapter.state === "reconcile") {
        if (!this.#restoreCanonical()) return null;
      }
      return this.#readOrdinaryBase();
    } catch {
      if (this.#queueIsUncertain()) {
        this.#fault("queueUncertain");
        return null;
      }
      // A stale current handle can make token issuance fail before a
      // controller has a chance to return its normal reconciliation result.
      if (!this.#restoreCanonical()) return null;
      try {
        return this.#readOrdinaryBase();
      } catch {
        this.#fault("reconciliationFailed");
        return null;
      }
    }
  }

  #readOrdinaryBase(): Readonly<{
    rendered: RouterAdapter["rendered"];
    delivery: ReturnType<RouterAdapter["deliveryToken"]>;
  }> {
    const rendered = this.#adapter.rendered;
    const delivery = this.#adapter.deliveryToken();
    // Token issuance is the adapter's final exact-base proof. Read the public
    // render first and require the same handle after issuance.
    if (this.#adapter.rendered !== rendered) {
      throw new TypeError("adapter render changed during event admission");
    }
    return Object.freeze({ rendered, delivery });
  }

  #afterOrdinary(
    disposition: BrowserEventDisposition<RouterOutcome>,
    route: "beforeinput" | "input" | "keydown",
  ): void {
    if (disposition.kind === "reconcileRequired") {
      if (disposition.reason === "queueFailure" || this.#queueIsUncertain()) {
        this.#fault("queueUncertain");
        return;
      }
      if (route !== "input" && disposition.defaultPrevented === false) {
        this.#scheduleCanonicalRestore();
      } else {
        this.#restoreCanonical();
      }
      return;
    }
    this.#verifyAdapterState(false);
  }

  #afterSelection(
    disposition: BrowserSelectionChangeDisposition<RouterOutcome>,
  ): void {
    if (disposition.kind === "reconcileRequired") {
      if (disposition.reason === "queueFailure" || this.#queueIsUncertain()) {
        this.#fault("queueUncertain");
        return;
      }
      this.#restoreCanonical();
      return;
    }
    this.#verifyAdapterState(false);
  }

  #afterClipboard(
    disposition: ReturnType<BreditorClipboardController["handleBeforeInput"]>,
    route: "beforeinput" | "input" | "copy" | "cut" | "paste",
  ): void {
    if (disposition.kind === "reconcileRequired") {
      if (
        disposition.reason === "queueFailure" ||
        disposition.reason === "queueUnavailable" ||
        disposition.reason === "leaseReleaseFailed" ||
        this.#queueIsUncertain()
      ) {
        this.#fault("queueUncertain");
        return;
      }
      if (
        disposition.defaultPrevented === false &&
        (route === "beforeinput" || route === "cut" || route === "paste")
      ) {
        this.#scheduleCanonicalRestore();
      } else {
        this.#restoreCanonical();
      }
      return;
    }
    this.#verifyAdapterState(false);
  }

  #afterComposition(disposition: CompositionControllerDisposition<RouterProjection>): void {
    if (disposition.kind === "recoveryRequired") {
      if (disposition.reason === "uncertain" || this.#queueIsUncertain()) {
        this.#fault("queueUncertain");
        return;
      }
      let recovered: CompositionControllerDisposition<RouterProjection>;
      try {
        recovered = this.#composition.recover();
      } catch {
        this.#fault("reconciliationFailed");
        return;
      }
      if (recovered.kind === "recovered") {
        this.#verifyAdapterState(false);
        return;
      }
      if (
        recovered.kind === "recoveryRequired" &&
        recovered.reason === "uncertain"
      ) {
        this.#fault("queueUncertain");
        return;
      }
      if (this.#composition.active) {
        this.#fault("reconciliationFailed");
        return;
      }
      this.#restoreCanonical();
      return;
    }
    if (
      disposition.kind === "settled" &&
      disposition.settlement.kind === "recoveryRequired"
    ) {
      this.#afterComposition(
        Object.freeze({
          kind: "recoveryRequired",
          reason: disposition.settlement.reason,
        }),
      );
      return;
    }
    this.#verifyAdapterState(
      disposition.kind === "native" || disposition.kind === "scheduled",
    );
  }

  #handleCompositionNotification(
    notification: CompositionControllerNotification<RouterProjection>,
  ): void {
    if (this.#status.kind !== "live") return;
    try {
      this.#afterComposition(notification);
    } catch {
      this.#fault(this.#queueIsUncertain() ? "queueUncertain" : "eventDispatchFailed");
    }
  }

  #verifyAdapterState(compositionMayBeActive: boolean): void {
    if (this.#status.kind !== "live") return;
    if (this.#queueIsUncertain()) {
      this.#fault("queueUncertain");
      return;
    }
    let state: BreditorWasmCommandAdapter["state"];
    try {
      state = this.#adapter.state;
    } catch {
      this.#fault("eventDispatchFailed");
      return;
    }
    if (state === "live" || (compositionMayBeActive && state === "composition")) {
      return;
    }
    if (state === "reconcile") {
      this.#restoreCanonical();
      return;
    }
    this.#fault(state === "faulted" ? "queueUncertain" : "eventDispatchFailed");
  }

  #restoreCanonical(): boolean {
    if (this.#status.kind !== "live") return false;
    this.#invalidatePendingRepair();
    if (this.#queueIsUncertain()) {
      this.#fault("queueUncertain");
      return false;
    }
    // Repair can run outside dispatch (or before its guard is installed).
    // DOM/selection restoration must not admit nested editing events either.
    const dispatching = this.#dispatching;
    this.#dispatching = true;
    try {
      const restored = this.#adapter.restoreCanonicalRender();
      if (this.#status.kind !== "live") return false;
      if (!restored.ok) {
        this.#fault("reconciliationFailed");
        return false;
      }
      this.#ordinary.forgetEchoReceipts();
      this.#clipboard.forgetEchoReceipt();
      return true;
    } catch {
      this.#fault("reconciliationFailed");
      return false;
    } finally {
      this.#dispatching = dispatching;
    }
  }

  #queueIsUncertain(): boolean {
    try {
      return this.#queue.failure !== undefined || this.#queue.disposed;
    } catch {
      return true;
    }
  }

  #scheduleCanonicalRestore(): void {
    if (this.#status.kind !== "live" || this.#repairPending) return;
    this.#repairPending = true;
    this.#repairGeneration += 1;
    const generation = this.#repairGeneration;
    let scheduling = true;
    let invoked = false;
    let invalidSchedule = false;
    try {
      const returned = this.#scheduleTask(() => {
        if (invoked) return;
        invoked = true;
        if (scheduling) {
          invalidSchedule = true;
          return;
        }
        if (
          this.#status.kind !== "live" ||
          !this.#repairPending ||
          this.#repairGeneration !== generation
        ) {
          return;
        }
        this.#finishPendingRepair();
      });
      invalidSchedule = containAsyncRejection(returned) || invalidSchedule;
    } catch {
      invalidSchedule = true;
    }
    scheduling = false;
    if (invalidSchedule) {
      invoked = true;
      this.#invalidatePendingRepair();
      this.#fault("reconciliationFailed");
    }
  }

  #finishPendingRepair(): boolean {
    if (!this.#repairPending) return this.#status.kind === "live";
    this.#invalidatePendingRepair();
    return this.#restoreCanonical();
  }

  #invalidatePendingRepair(): void {
    this.#repairPending = false;
    this.#repairGeneration += 1;
  }

  #fault(reason: BrowserEventRouterFaultReason): void {
    if (this.#status.kind !== "live") return;
    this.#transition(Object.freeze({ kind: "faulted", reason }));
  }

  #transition(status: BrowserEventRouterStatus): void {
    if (this.#status.kind !== "live") return;
    // Logical invalidation precedes every external teardown effect. A listener
    // retained by a browser or hostile monkeypatch is already inert.
    this.#status = status;
    this.#invalidatePendingRepair();
    this.#removeListeners();
    if (HOST_ROUTERS.get(this.#host) === this.#ownership) {
      HOST_ROUTERS.delete(this.#host);
    }
    try {
      this.#clipboard.dispose();
    } catch {
      // Terminal status remains authoritative.
    }
    try {
      this.#composition.dispose();
    } catch {
      // Terminal status remains authoritative.
    }
    const subscribers = this.#subscribers.slice();
    this.#subscribers.length = 0;
    for (const slot of subscribers) {
      try {
        containAsyncRejection(Reflect.apply(slot.listener, undefined, [status]));
      } catch {
        // Subscriber-local failure cannot affect sibling delivery or status.
      }
    }
  }
}

/** Existing paragraph/heading event router. List dependencies remain closed. */
export class BreditorBrowserEventRouter extends BrowserEventRouterCore {
  constructor(queue: BreditorCommandQueue<WasmCommandSequenceOutcome>,
    adapter: BreditorWasmCommandAdapter, options: BrowserEventRouterOptions) {
    super(queue, adapter, options, false);
  }
}

/** Complete native-listener boundary for the experimental hierarchical list mode. @internal */
export class BreditorFlatListBrowserEventRouter extends BrowserEventRouterCore {
  constructor(queue: BreditorFlatListCommandQueue<WasmCommandSequenceOutcome<FlatListDocumentProjection>>,
    adapter: BreditorFlatListWasmCommandAdapter, options: BrowserEventRouterOptions) {
    super(queue, adapter, options, true);
  }
}

/** Complete native-listener boundary for recursive lists. @internal */
export class BreditorNestedListBrowserEventRouter extends BrowserEventRouterCore {
  constructor(queue: BreditorNestedListCommandQueue<WasmCommandSequenceOutcome<NestedListDocumentProjection>>,
    adapter: BreditorNestedListWasmCommandAdapter, options: BrowserEventRouterOptions) {
    super(queue, adapter, options, "nested");
  }
}

function readInitialRender(
  adapter: RouterAdapter,
): RouterAdapter["rendered"] | null {
  try {
    const rendered = adapter.rendered;
    return rendered !== null &&
        typeof rendered === "object" &&
        typeof rendered.validateCanonicalDom === "function"
      ? rendered
      : null;
  } catch {
    return null;
  }
}

function readOwnerDocument(host: HTMLElement): Document | null {
  try {
    const facts = nativeHtmlHostFacts(host);
    return facts !== undefined && facts.isConnected ? facts.ownerDocument : null;
  } catch {
    return null;
  }
}

function readListenerIntrinsics(
  host: HTMLElement,
  document: Document,
): ListenerIntrinsics | null {
  try {
    const hostIntrinsics = readTargetListenerIntrinsics(host);
    const documentIntrinsics = readTargetListenerIntrinsics(document);
    return hostIntrinsics === null || documentIntrinsics === null
      ? null
      : Object.freeze({ host: hostIntrinsics, document: documentIntrinsics });
  } catch {
    return null;
  }
}

function readTargetListenerIntrinsics(
  target: object,
): TargetListenerIntrinsics | null {
  const prototype =
    typeof EventTarget === "function" ? EventTarget.prototype : undefined;
  const add = Object.getOwnPropertyDescriptor(
    prototype ?? Object.prototype,
    "addEventListener",
  )?.value;
  const remove = Object.getOwnPropertyDescriptor(
    prototype ?? Object.prototype,
    "removeEventListener",
  )?.value;
  if (typeof add !== "function" || typeof remove !== "function") return null;
  const intrinsics = Object.freeze({
    add: add as typeof EventTarget.prototype.addEventListener,
    remove: remove as typeof EventTarget.prototype.removeEventListener,
  });
  // A no-op native removal supplies the receiver brand check without
  // consulting, registering with, or exposing callbacks to its prototype.
  Reflect.apply(intrinsics.remove, target, [
    "breditor-intrinsics-probe",
    NOOP_UNSUBSCRIBE,
    false,
  ]);
  return intrinsics;
}

function snapshotOptions(
  options: BrowserEventRouterOptions,
  profileDescriptor: ReturnType<typeof profileDescriptorForAdapter>,
): Readonly<{
  keyboard: KeyboardTranslationPolicy;
  keyboardShortcuts: BrowserCompiledKeyboardShortcuts;
  scheduleTask?: (callback: () => void) => void;
}> | null {
  try {
    if (!objectLike(options)) return null;
    const keyboard = options.keyboard;
    const keyboardShortcuts =
      options.keyboardShortcuts ??
      (profileDescriptor === undefined
        ? DEFAULT_COMPILED_KEYBOARD_SHORTCUTS
        : compileCompatibleDefaultKeyboardShortcuts(profileDescriptor));
    const scheduleTask = options.scheduleTask;
    if (
      !isOwnedBrowserCompiledKeyboardShortcuts(keyboardShortcuts) ||
      (profileDescriptor !== undefined &&
        keyboardShortcuts.profileDescriptor !== profileDescriptor) ||
      (scheduleTask !== undefined && typeof scheduleTask !== "function")
    ) {
      return null;
    }
    return Object.freeze({
      keyboard,
      keyboardShortcuts,
      ...(scheduleTask === undefined ? {} : { scheduleTask }),
    });
  } catch {
    return null;
  }
}

function isNonCompositionDisposition(
  disposition: CompositionControllerDisposition<RouterProjection>,
): boolean {
  return disposition.kind === "ignored" && disposition.reason === "notComposition";
}

function isInactiveCompositionDisposition(
  disposition: CompositionControllerDisposition<RouterProjection>,
): boolean {
  return disposition.kind === "ignored" && disposition.reason === "inactive";
}

function isNonClipboardDisposition(
  disposition: ReturnType<BreditorClipboardController["handleBeforeInput"]>,
): boolean {
  return disposition.kind === "ignored" && disposition.reason === "notClipboardInput";
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
