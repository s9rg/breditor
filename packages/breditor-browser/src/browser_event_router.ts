import { BreditorBrowserEventController } from "./browser_event_controller.js";
import { BreditorClipboardController } from "./clipboard_controller.js";
import { BreditorCommandQueue } from "./command_queue.js";
import {
  BreditorCompositionController,
  type CompositionControllerDisposition,
  type CompositionControllerNotification,
} from "./composition_controller.js";
import type {
  BrowserEventDisposition,
  BrowserSelectionChangeDisposition,
} from "./event_disposition.js";
import type { RenderedProjection } from "./dom_renderer.js";
import type { KeyboardTranslationPolicy } from "./keyboard.js";
import {
  type BreditorWasmCommandAdapter,
  type WasmCommandSequenceOutcome,
} from "./wasm_command_adapter.js";

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
}

interface ListenerIntrinsics {
  readonly add: typeof EventTarget.prototype.addEventListener;
  readonly remove: typeof EventTarget.prototype.removeEventListener;
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
export class BreditorBrowserEventRouter {
  readonly #ownership = Object.freeze({});
  readonly #queue: BreditorCommandQueue<WasmCommandSequenceOutcome>;
  readonly #adapter: BreditorWasmCommandAdapter;
  readonly #host: HTMLElement;
  readonly #document: Document;
  readonly #listenerIntrinsics: ListenerIntrinsics;
  readonly #scheduleTask: (callback: () => void) => void;
  readonly #ordinary: BreditorBrowserEventController<WasmCommandSequenceOutcome>;
  readonly #clipboard: BreditorClipboardController;
  readonly #composition: BreditorCompositionController;
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
    queue: BreditorCommandQueue<WasmCommandSequenceOutcome>,
    adapter: BreditorWasmCommandAdapter,
    options: BrowserEventRouterOptions,
  ) {
    const rendered = readInitialRender(adapter);
    if (rendered === null) {
      throw new TypeError("browser event router adapter is invalid");
    }
    const host = rendered.host;
    const ownerDocument = readOwnerDocument(host);
    if (ownerDocument === null) {
      throw new TypeError("browser event router host is invalid");
    }
    const listenerIntrinsics = readListenerIntrinsics(ownerDocument);
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
    let composition: BreditorCompositionController | undefined;
    let clipboard: BreditorClipboardController | undefined;
    try {
      const snapshot = snapshotOptions(options);
      if (snapshot === null) {
        throw new TypeError("browser event router options are invalid");
      }
      this.#scheduleTask = snapshot.scheduleTask ?? defaultScheduleTask;
      composition = new BreditorCompositionController(queue, adapter, {
        ...(snapshot.scheduleTask === undefined
          ? {}
          : { scheduleTask: snapshot.scheduleTask }),
        onSettlement: (result) => this.#handleCompositionNotification(result),
      });
      clipboard = new BreditorClipboardController(queue, adapter);
      const ordinary = new BreditorBrowserEventController(queue, {
        keyboard: snapshot.keyboard,
        selectionBridge: adapter.selectionBridge,
        deliveryAuthority: adapter.deliveryAuthority,
        compositionActive: () => composition?.active === true,
      });

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
    this.#add(this.#host, "compositionstart", this.#onComposition, false);
    this.#add(this.#host, "compositionupdate", this.#onComposition, false);
    this.#add(this.#host, "compositionend", this.#onComposition, false);
    this.#add(this.#host, "beforeinput", this.#onBeforeInput, false);
    this.#add(this.#host, "input", this.#onInput, false);
    this.#add(this.#host, "keydown", this.#onKeyDown, false);
    this.#add(this.#host, "copy", this.#onCopy, false);
    this.#add(this.#host, "cut", this.#onCut, false);
    this.#add(this.#host, "paste", this.#onPaste, false);
    this.#add(this.#host, "blur", this.#onBlur, true);
    this.#add(this.#document, "selectionchange", this.#onSelectionChange, false);
  }

  #add(
    target: EventTarget,
    type: string,
    listener: EventListener,
    capture: boolean,
  ): void {
    const registration = Object.freeze({ target, type, listener, capture });
    // Record rollback before invoking platform code. A patched intrinsic may
    // install, synchronously dispatch into this router, and only then throw.
    this.#registrations.push(registration);
    try {
      Reflect.apply(this.#listenerIntrinsics.add, target, [
        type,
        listener,
        capture,
      ]);
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
        Reflect.apply(this.#listenerIntrinsics.remove, registration.target, [
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

  #ordinaryRender(): RenderedProjection | null {
    const base = this.#ordinaryBase();
    return base?.rendered ?? null;
  }

  #ordinaryBase(): Readonly<{
    rendered: BreditorWasmCommandAdapter["rendered"];
    delivery: ReturnType<BreditorWasmCommandAdapter["deliveryToken"]>;
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
    rendered: BreditorWasmCommandAdapter["rendered"];
    delivery: ReturnType<BreditorWasmCommandAdapter["deliveryToken"]>;
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
    disposition: BrowserEventDisposition<WasmCommandSequenceOutcome>,
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
    disposition: BrowserSelectionChangeDisposition<WasmCommandSequenceOutcome>,
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

  #afterComposition(disposition: CompositionControllerDisposition): void {
    if (disposition.kind === "recoveryRequired") {
      if (disposition.reason === "uncertain" || this.#queueIsUncertain()) {
        this.#fault("queueUncertain");
        return;
      }
      let recovered: CompositionControllerDisposition;
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
    notification: CompositionControllerNotification,
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
    try {
      const restored = this.#adapter.restoreCanonicalRender();
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
    let synchronous = false;
    try {
      const returned = this.#scheduleTask(() => {
        if (invoked) return;
        invoked = true;
        if (scheduling) {
          synchronous = true;
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
      containAsyncRejection(returned);
    } catch {
      scheduling = false;
      this.#invalidatePendingRepair();
      this.#fault("reconciliationFailed");
      return;
    }
    scheduling = false;
    if (synchronous) {
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

function readInitialRender(
  adapter: BreditorWasmCommandAdapter,
): BreditorWasmCommandAdapter["rendered"] | null {
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
    const ownerDocument = host.ownerDocument;
    return host.isConnected &&
        ownerDocument !== null &&
        typeof ownerDocument === "object"
      ? ownerDocument
      : null;
  } catch {
    return null;
  }
}

function readListenerIntrinsics(document: Document): ListenerIntrinsics | null {
  try {
    const prototype = document.defaultView?.EventTarget.prototype;
    if (prototype === undefined) return null;
    const add = Object.getOwnPropertyDescriptor(
      prototype,
      "addEventListener",
    )?.value as unknown;
    const remove = Object.getOwnPropertyDescriptor(
      prototype,
      "removeEventListener",
    )?.value as unknown;
    if (typeof add !== "function" || typeof remove !== "function") return null;
    return Object.freeze({
      add: add as typeof EventTarget.prototype.addEventListener,
      remove: remove as typeof EventTarget.prototype.removeEventListener,
    });
  } catch {
    return null;
  }
}

function snapshotOptions(options: BrowserEventRouterOptions): Readonly<{
  keyboard: KeyboardTranslationPolicy;
  scheduleTask?: (callback: () => void) => void;
}> | null {
  try {
    if (!objectLike(options)) return null;
    const keyboard = options.keyboard;
    const scheduleTask = options.scheduleTask;
    if (scheduleTask !== undefined && typeof scheduleTask !== "function") {
      return null;
    }
    return Object.freeze({
      keyboard,
      ...(scheduleTask === undefined ? {} : { scheduleTask }),
    });
  } catch {
    return null;
  }
}

function isNonCompositionDisposition(
  disposition: CompositionControllerDisposition,
): boolean {
  return disposition.kind === "ignored" && disposition.reason === "notComposition";
}

function isInactiveCompositionDisposition(
  disposition: CompositionControllerDisposition,
): boolean {
  return disposition.kind === "ignored" && disposition.reason === "inactive";
}

function isNonClipboardDisposition(
  disposition: ReturnType<BreditorClipboardController["handleBeforeInput"]>,
): boolean {
  return disposition.kind === "ignored" && disposition.reason === "notClipboardInput";
}

function containAsyncRejection(value: unknown): void {
  if (!objectLike(value)) return;
  try {
    const then = (value as Readonly<{ then?: unknown }>).then;
    if (typeof then === "function") {
      void Promise.resolve(value).catch(() => {});
    }
  } catch {
    // A hostile thenable is subscriber-local failure too.
  }
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
