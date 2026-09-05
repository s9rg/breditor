import {
  createToolbarManifest,
  isOwnedToolbarManifest,
  type ToolbarCommandDeclaration,
  type ToolbarControlDeclaration,
  type ToolbarManifest,
} from "./toolbar_manifest.js";
import {
  historyRequest,
  noInputActionRequest,
  preserveSelectionSync,
  stringActionRequest,
  type EditorDeliveryToken,
  type EngineCommandRequest,
} from "./editor_command.js";

/** Maximum entries inspected from one browser action-state snapshot. */
export const MAX_TOOLBAR_STATE_ENTRIES = 512;

/** Action-state fields consumed by the presentation layer. */
export interface ToolbarActionStateEntry {
  readonly id: string;
  readonly availability:
    | "enabled"
    | "disabled"
    | "blocked"
    | "unhandled"
    | "faulted";
  readonly activation: "stateless" | "inactive" | "active" | "mixed" | undefined;
}

/** Complete state read model needed by a toolbar refresh. */
export interface ToolbarActionStateSnapshot {
  readonly entries: readonly ToolbarActionStateEntry[];
}

/** Narrow structural view implemented by `BreditorActionStateStore`. */
export interface ToolbarActionStateStore {
  getSnapshot(): ToolbarActionStateSnapshot | undefined;
  getStatus(): Readonly<{
    readonly status: "unavailable" | "fresh" | "stale" | "disposed";
  }>;
  subscribe(listener: () => void): () => void;
}

/**
 * One presentation invocation. `preserve` requires the runtime to use its last
 * exact semantic editor selection even when keyboard focus is in the toolbar.
 */
export interface ToolbarCommandInvocation {
  readonly stateId: string;
  readonly selection: "preserve";
  readonly command: ToolbarCommandDeclaration;
}

/** Closed synchronous outcome returned by a toolbar command dispatcher. */
export type ToolbarCommandDispatchResult = Readonly<{
  readonly status: "completed" | "rejected" | "failed";
}>;

const OWNED_TOOLBAR_DISPATCH_RESULTS = new WeakSet<object>();

/**
 * Mints one immutable dispatch outcome accepted by `BreditorToolbar`.
 *
 * `completed` means the command finished synchronously, `rejected` means no
 * command ran, and `failed` means the runtime can no longer prove a safe
 * outcome. A failed or structurally invalid result faults the toolbar closed.
 */
export function toolbarCommandDispatchResult(
  status: ToolbarCommandDispatchResult["status"],
): ToolbarCommandDispatchResult {
  if (status !== "completed" && status !== "rejected" && status !== "failed") {
    throw new TypeError("toolbar dispatch status is invalid");
  }
  const result: ToolbarCommandDispatchResult = Object.freeze({ status });
  OWNED_TOOLBAR_DISPATCH_RESULTS.add(result);
  return result;
}

/** Synchronous semantic sink; queueing and stale-base checks remain runtime-owned. */
export interface ToolbarCommandDispatcher {
  dispatch(invocation: ToolbarCommandInvocation): ToolbarCommandDispatchResult;
}

/**
 * Converts one declarative toolbar invocation into a guarded queue request.
 *
 * This function performs no dispatch. The runtime supplies its current exact
 * delivery token, receives an ordinary `EngineCommandRequest`, and submits it
 * through the editor's shared queue. Every branch uses `preserveSelectionSync`
 * so moving keyboard focus into the toolbar cannot clear the semantic range.
 */
export function toolbarCommandRequest(
  delivery: EditorDeliveryToken,
  invocation: ToolbarCommandInvocation,
): EngineCommandRequest {
  if (typeof invocation !== "object" || invocation === null) {
    throw new TypeError("toolbar invocation is invalid");
  }
  const stateId = invocation.stateId;
  const selection = invocation.selection;
  const command = invocation.command;
  if (
    selection !== "preserve" ||
    typeof stateId !== "string" ||
    stateId.length > 128 ||
    !/^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(stateId) ||
    typeof command !== "object" ||
    command === null
  ) {
    throw new TypeError("toolbar invocation is invalid");
  }
  const source = Object.freeze({ kind: "toolbar" as const, detail: stateId });
  const preserved = preserveSelectionSync();
  if (command.kind === "history") {
    return historyRequest(delivery, preserved, source, command.operation);
  }
  if (command.kind !== "action") {
    throw new TypeError("toolbar command is invalid");
  }
  if (command.input.kind === "none") {
    return noInputActionRequest(
      delivery,
      preserved,
      source,
      command.actionId,
      command.history,
    );
  }
  if (command.input.kind === "string") {
    return stringActionRequest(
      delivery,
      preserved,
      source,
      command.actionId,
      command.input.value,
      command.history,
    );
  }
  throw new TypeError("toolbar command is invalid");
}

/** Observable lifecycle of one mounted toolbar. */
export type BreditorToolbarState = "live" | "faulted" | "disposed";

interface ButtonRecord {
  readonly declaration: ToolbarControlDeclaration;
  readonly button: HTMLButtonElement;
  readonly invocation: ToolbarCommandInvocation;
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onMouseDown: (event: MouseEvent) => void;
  readonly onFocus: () => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onClick: (event: MouseEvent) => void;
  enabled: boolean;
}

interface NormalizedActionState {
  readonly availability: ToolbarActionStateEntry["availability"];
  readonly activation: ToolbarActionStateEntry["activation"];
}

const TOOLBAR_HOSTS = new WeakMap<HTMLElement, BreditorToolbar>();

/**
 * Accessible native-button toolbar driven only by a frozen manifest and store.
 *
 * Pointer activation prevents the toolbar from taking focus, preserving the
 * browser selection. Keyboard activation keeps toolbar focus and dispatches an
 * explicit `selection: "preserve"` invocation, which lets the runtime reuse its
 * last exact semantic editor selection. Every click is still revalidated by the
 * command runtime; an action-state snapshot is display and admission guidance,
 * never an executable capability.
 */
export class BreditorToolbar {
  readonly #host: HTMLElement;
  readonly #element!: HTMLDivElement;
  readonly #manifest!: ToolbarManifest;
  readonly #readSnapshot!: () => ToolbarActionStateSnapshot | undefined;
  readonly #readStoreStatus!: () => unknown;
  readonly #dispatch!: (invocation: ToolbarCommandInvocation) => unknown;
  readonly #buttons: ButtonRecord[] = [];
  #unsubscribe: (() => void) | undefined;
  #activeIndex = 0;
  #state: BreditorToolbarState = "live";

  constructor(
    host: HTMLElement,
    manifest: ToolbarManifest,
    stateStore: ToolbarActionStateStore,
    dispatcher: ToolbarCommandDispatcher,
  ) {
    requireToolbarHost(host);
    if (TOOLBAR_HOSTS.has(host)) {
      throw new TypeError("toolbar host already has a live Breditor toolbar");
    }
    this.#host = host;
    // Reserve before inspecting any application-controlled dependency. A
    // descriptor/proxy trap may reenter construction, but it cannot create a
    // second live toolbar for this mount while the outer constructor is open.
    TOOLBAR_HOSTS.set(host, this);

    try {
      this.#manifest = isOwnedToolbarManifest(manifest)
        ? manifest
        : createToolbarManifest(manifest);

      const store = requireObject(stateStore, "toolbar action-state store");
      const getSnapshot = store["getSnapshot"];
      const getStatus = store["getStatus"];
      const subscribe = store["subscribe"];
      if (
        typeof getSnapshot !== "function" ||
        typeof getStatus !== "function" ||
        typeof subscribe !== "function"
      ) {
        throw new TypeError("toolbar action-state store is invalid");
      }
      this.#readSnapshot = () =>
        Reflect.apply(getSnapshot, stateStore, []) as
          | ToolbarActionStateSnapshot
          | undefined;
      this.#readStoreStatus = () =>
        Reflect.apply(getStatus, stateStore, []) as unknown;

      const dispatchTarget = requireObject(
        dispatcher,
        "toolbar command dispatcher",
      );
      const dispatch = dispatchTarget["dispatch"];
      if (typeof dispatch !== "function") {
        throw new TypeError("toolbar command dispatcher is invalid");
      }
      this.#dispatch = (invocation) =>
        Reflect.apply(dispatch, dispatcher, [invocation]);

      const element = host.ownerDocument.createElement("div");
      element.setAttribute("data-breditor-toolbar-root", "");
      element.setAttribute("role", "toolbar");
      element.setAttribute("aria-label", this.#manifest.label);
      element.setAttribute("aria-orientation", "horizontal");
      this.#element = element;
      this.#installButtons();
      host.append(element);
      const unsubscribe = Reflect.apply(subscribe, stateStore, [this.#refreshFromStore]);
      if (typeof unsubscribe !== "function") {
        throw new TypeError("toolbar action-state subscription is invalid");
      }
      this.#unsubscribe = unsubscribe;
      if (this.#state === "live") {
        this.#refreshFromStore();
      } else {
        this.#releaseSubscription();
      }
    } catch (error) {
      // A broken subscriber can retain the callback before throwing or
      // returning an invalid unsubscribe value. Make every retained callback
      // inert before rolling back the owned DOM and mount registration.
      this.#state = "disposed";
      this.#releaseSubscription();
      if (this.#element !== undefined) {
        this.#disposeInstalledDom();
      }
      if (TOOLBAR_HOSTS.get(host) === this) {
        TOOLBAR_HOSTS.delete(host);
      }
      throw error;
    }
  }

  /** Owned element carrying `role="toolbar"` and the generated native buttons. */
  get element(): HTMLElement {
    return this.#element;
  }

  /** Frozen presentation manifest captured by this toolbar. */
  get manifest(): ToolbarManifest {
    return this.#manifest;
  }

  /** Current lifecycle; callback contract violations fail the toolbar closed. */
  get state(): BreditorToolbarState {
    return this.#state;
  }

  /** Re-reads the latest published action-state snapshot and updates ARIA state. */
  refresh(): void {
    this.#refreshFromStore();
  }

  /** Removes subscriptions, listeners, generated controls, and installed attributes. */
  dispose(): void {
    if (this.#state === "disposed") return;
    this.#state = "disposed";
    this.#releaseSubscription();
    this.#disposeInstalledDom();
    if (TOOLBAR_HOSTS.get(this.#host) === this) {
      TOOLBAR_HOSTS.delete(this.#host);
    }
  }

  #installButtons(): void {
    const ownerDocument = this.#element.ownerDocument;
    for (let index = 0; index < this.#manifest.controls.length; index += 1) {
      const declaration = this.#manifest.controls[index];
      if (declaration === undefined) continue;
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.textContent = declaration.label;
      button.setAttribute("aria-label", declaration.label);
      button.setAttribute("aria-disabled", "true");
      button.setAttribute("tabindex", index === 0 ? "0" : "-1");
      button.setAttribute("data-breditor-state-id", declaration.stateId);
      if (declaration.group !== undefined) {
        button.setAttribute("data-breditor-group", declaration.group);
      }
      if (declaration.activation === "tracked") {
        button.setAttribute("aria-pressed", "false");
      }

      const invocation: ToolbarCommandInvocation = Object.freeze({
        stateId: declaration.stateId,
        selection: "preserve",
        command: declaration.command,
      });
      const record = {} as ButtonRecord;
      const onPointerDown = (event: PointerEvent) => {
        this.#handlePointerDown(index, event);
      };
      const onMouseDown = (event: MouseEvent) => {
        this.#handleMouseDown(index, event);
      };
      const onFocus = () => {
        this.#handleFocus(index);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        this.#handleKeyDown(index, event);
      };
      const onClick = (event: MouseEvent) => {
        this.#handleClick(record, event);
      };
      Object.assign(record, {
        declaration,
        button,
        invocation,
        onPointerDown,
        onMouseDown,
        onFocus,
        onKeyDown,
        onClick,
        enabled: false,
      });
      this.#buttons.push(record);
      button.addEventListener("pointerdown", onPointerDown);
      button.addEventListener("mousedown", onMouseDown);
      button.addEventListener("focus", onFocus);
      button.addEventListener("keydown", onKeyDown);
      button.addEventListener("click", onClick);
      this.#element.append(button);
    }
  }

  readonly #refreshFromStore = (): void => {
    if (this.#state !== "live") return;
    let snapshot: ToolbarActionStateSnapshot | undefined;
    let storeStatus: unknown;
    try {
      snapshot = this.#readSnapshot();
      storeStatus = this.#readStoreStatus();
    } catch {
      this.#fault();
      return;
    }
    let states: ReadonlyMap<string, NormalizedActionState> | null;
    try {
      const freshness = readToolbarStoreFreshness(storeStatus);
      if (freshness === null) {
        this.#fault();
        return;
      }
      states = freshness === "fresh" ? normalizeActionStates(snapshot) : new Map();
    } catch {
      states = null;
    }
    for (const record of this.#buttons) {
      const entry = states?.get(record.declaration.stateId);
      this.#renderButtonState(record, entry);
    }
  };

  #renderButtonState(record: ButtonRecord, entry: NormalizedActionState | undefined): void {
    let contractMatches = false;
    if (record.declaration.activation === "tracked") {
      const pressed =
        entry?.activation === "active"
          ? "true"
          : entry?.activation === "mixed"
            ? "mixed"
            : "false";
      record.button.setAttribute("aria-pressed", pressed);
      contractMatches =
        entry?.activation === "inactive" ||
        entry?.activation === "active" ||
        entry?.activation === "mixed";
    } else {
      record.button.removeAttribute("aria-pressed");
      contractMatches = entry?.activation === "stateless";
    }
    record.enabled =
      this.#state === "live" && entry?.availability === "enabled" && contractMatches;
    record.button.setAttribute("aria-disabled", record.enabled ? "false" : "true");
  }

  #handlePointerDown(index: number, event: PointerEvent): void {
    if (this.#state !== "live" || event.button !== 0) return;
    event.preventDefault();
    this.#setActiveIndex(index, false);
  }

  #handleMouseDown(index: number, event: MouseEvent): void {
    if (this.#state !== "live" || event.button !== 0) return;
    // Pointer Events normally suppress this compatibility focus step already;
    // the mouse fallback covers older or synthetic hosts without moving focus.
    event.preventDefault();
    this.#setActiveIndex(index, false);
  }

  #handleFocus(index: number): void {
    if (this.#state !== "live") return;
    this.#setActiveIndex(index, false);
  }

  #handleKeyDown(index: number, event: KeyboardEvent): void {
    if (
      this.#state !== "live" ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    let next: number | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % this.#buttons.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + this.#buttons.length) % this.#buttons.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = this.#buttons.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.#setActiveIndex(next, true);
  }

  #setActiveIndex(index: number, focus: boolean): void {
    if (index < 0 || index >= this.#buttons.length) return;
    this.#activeIndex = index;
    for (let candidate = 0; candidate < this.#buttons.length; candidate += 1) {
      this.#buttons[candidate]?.button.setAttribute(
        "tabindex",
        candidate === this.#activeIndex ? "0" : "-1",
      );
    }
    if (focus && this.#state === "live") {
      this.#buttons[index]?.button.focus();
    }
  }

  #handleClick(record: ButtonRecord, event: MouseEvent): void {
    event.preventDefault();
    if (this.#state !== "live" || record.button.parentNode !== this.#element) {
      return;
    }
    this.#refreshFromStore();
    if (!record.enabled || this.#state !== "live") return;
    const restoreToolbarFocus = record.button.ownerDocument.activeElement === record.button;
    try {
      const result = this.#dispatch(record.invocation);
      if (isPromiseLike(result)) {
        void Promise.resolve(result).catch(() => undefined);
        this.#fault();
        return;
      }
      if (!isOwnedToolbarDispatchResult(result) || result.status === "failed") {
        this.#fault();
        return;
      }
      if (restoreToolbarFocus && this.#state === "live") {
        if (record.button.parentNode !== this.#element || !record.button.isConnected) {
          this.#fault();
          return;
        }
        record.button.focus({ preventScroll: true });
        if (record.button.ownerDocument.activeElement !== record.button) {
          this.#fault();
        }
      }
    } catch {
      this.#fault();
    }
  }

  #fault(): void {
    if (this.#state !== "live") return;
    this.#state = "faulted";
    this.#releaseSubscription();
    for (const record of this.#buttons) {
      record.enabled = false;
      record.button.setAttribute("aria-disabled", "true");
    }
  }

  #releaseSubscription(): void {
    const unsubscribe = this.#unsubscribe;
    this.#unsubscribe = undefined;
    if (unsubscribe !== undefined) {
      try {
        unsubscribe();
      } catch {
        // Disposal/fail-stop still completes when an application callback errs.
      }
    }
  }

  #disposeInstalledDom(): void {
    for (const record of this.#buttons) {
      record.button.removeEventListener("pointerdown", record.onPointerDown);
      record.button.removeEventListener("mousedown", record.onMouseDown);
      record.button.removeEventListener("focus", record.onFocus);
      record.button.removeEventListener("keydown", record.onKeyDown);
      record.button.removeEventListener("click", record.onClick);
      record.button.remove();
    }
    this.#buttons.splice(0, this.#buttons.length);
    this.#element.remove();
  }
}

function normalizeActionStates(
  snapshot: ToolbarActionStateSnapshot | undefined,
): ReadonlyMap<string, NormalizedActionState> | null {
  if (snapshot === undefined) return new Map();
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const entries = (snapshot as unknown as Readonly<Record<string, unknown>>)["entries"];
  if (!Array.isArray(entries)) return null;
  const entryCount = entries.length;
  if (entryCount > MAX_TOOLBAR_STATE_ENTRIES) return null;

  const normalized = new Map<string, NormalizedActionState>();
  // Index the captured array bound instead of consulting an application-owned
  // iterator, which could yield more entries than `length` advertised.
  for (let index = 0; index < entryCount; index += 1) {
    const rawEntry = (entries as readonly unknown[])[index];
    if (typeof rawEntry !== "object" || rawEntry === null) return null;
    const entry = rawEntry as Readonly<Record<string, unknown>>;
    const id = entry["id"];
    const availability = entry["availability"];
    const activation = entry["activation"];
    if (
      typeof id !== "string" ||
      id.length > 128 ||
      !/^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(id) ||
      !isAvailability(availability) ||
      !isActivation(activation) ||
      normalized.has(id)
    ) {
      return null;
    }
    normalized.set(id, Object.freeze({ availability, activation }));
  }
  return normalized;
}

function isAvailability(
  value: unknown,
): value is ToolbarActionStateEntry["availability"] {
  return (
    value === "enabled" ||
    value === "disabled" ||
    value === "blocked" ||
    value === "unhandled" ||
    value === "faulted"
  );
}

function isActivation(
  value: unknown,
): value is ToolbarActionStateEntry["activation"] {
  return (
    value === undefined ||
    value === "stateless" ||
    value === "inactive" ||
    value === "active" ||
    value === "mixed"
  );
}

function readToolbarStoreFreshness(
  value: unknown,
): "unavailable" | "fresh" | "stale" | "disposed" | null {
  if (typeof value !== "object" || value === null) return null;
  const status = (value as Readonly<Record<string, unknown>>)["status"];
  return status === "unavailable" ||
    status === "fresh" ||
    status === "stale" ||
    status === "disposed"
    ? status
    : null;
}

function requireToolbarHost(host: unknown): asserts host is HTMLElement {
  try {
    if (
      typeof host !== "object" ||
      host === null ||
      (host as Node).nodeType !== 1 ||
      (host as Element).namespaceURI !== "http://www.w3.org/1999/xhtml" ||
      (host as Element).ownerDocument === null ||
      !SAFE_TOOLBAR_MOUNT_TAGS.has((host as Element).tagName) ||
      hasInteractiveMountSemantics(host as HTMLElement) ||
      isInsideEditableRegion(host as HTMLElement)
    ) {
      throw new TypeError("toolbar host is invalid");
    }
  } catch {
    throw new TypeError("toolbar host is invalid");
  }
}

const SAFE_TOOLBAR_MOUNT_TAGS: ReadonlySet<string> = new Set([
  "ARTICLE",
  "ASIDE",
  "DIV",
  "FOOTER",
  "HEADER",
  "MAIN",
  "NAV",
  "SECTION",
]);

const SAFE_TOOLBAR_MOUNT_ROLES: ReadonlySet<string> = new Set([
  "",
  "banner",
  "complementary",
  "contentinfo",
  "form",
  "generic",
  "group",
  "main",
  "navigation",
  "none",
  "presentation",
  "region",
  "search",
]);

function hasInteractiveMountSemantics(host: HTMLElement): boolean {
  if (host.hasAttribute("tabindex")) return true;
  const role = host.getAttribute("role");
  if (role === null) return false;
  const tokens = role.trim().toLowerCase().split(/\s+/u);
  return tokens.some((token) => !SAFE_TOOLBAR_MOUNT_ROLES.has(token));
}

function isInsideEditableRegion(host: HTMLElement): boolean {
  let candidate: HTMLElement | null = host;
  while (candidate !== null) {
    const raw = candidate.getAttribute("contenteditable");
    if (raw !== null) {
      const value = raw.trim().toLowerCase();
      if (value === "false") return false;
      if (value === "" || value === "true" || value === "plaintext-only") {
        return true;
      }
    }
    candidate = candidate.parentElement;
  }
  return false;
}

function requireObject(
  value: unknown,
  description: string,
): Readonly<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null) {
      throw new TypeError(`${description} is invalid`);
    }
    return value as Readonly<Record<string, unknown>>;
  } catch {
    throw new TypeError(`${description} is invalid`);
  }
}

function isPromiseLike(value: unknown): boolean {
  try {
    return (
      (typeof value === "object" && value !== null) || typeof value === "function"
    ) && typeof (value as Readonly<{ then?: unknown }>).then === "function";
  } catch {
    return true;
  }
}

function isOwnedToolbarDispatchResult(
  value: unknown,
): value is ToolbarCommandDispatchResult {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      OWNED_TOOLBAR_DISPATCH_RESULTS.has(value)
    );
  } catch {
    return false;
  }
}
