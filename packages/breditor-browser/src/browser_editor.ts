import {
  BreditorActionStateStore,
  type ActionStateStoreError,
  type ActionStateStoreStatus,
} from "./action_state_store.js";
import {
  BreditorBrowserEventRouter,
  type BrowserEventRouterFaultReason,
  type BrowserEventRouterStatus,
} from "./browser_event_router.js";
import { BreditorCommandQueue } from "./command_queue.js";
import {
  BreditorDomRenderer,
  type RenderedProjection,
} from "./dom_renderer.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import {
  IndexedDbSessionCheckpointStore,
  type IndexedDbSessionCheckpointCasToken,
  type IndexedDbSessionCheckpointLoadResult,
} from "./indexeddb_session_checkpoint.js";
import type { KeyboardTranslationPolicy } from "./keyboard.js";
import {
  BreditorSessionCheckpointAutosave,
  type SessionCheckpointAutosaveFlushResult,
  type SessionCheckpointAutosaveOptions,
  type SessionCheckpointAutosaveStatus,
} from "./session_checkpoint_autosave.js";
import {
  BreditorToolbar,
  toolbarCommandDispatchResult,
  toolbarCommandRequest,
  type ToolbarCommandDispatchResult,
  type ToolbarCommandInvocation,
} from "./toolbar.js";
import {
  DEFAULT_TOOLBAR_MANIFEST,
  type ToolbarManifest,
} from "./toolbar_manifest.js";
import type { BrowserActionStateSnapshot } from "./wasm_action_state_adapter.js";
import type { BrowserProjectionPlainTextResult } from "./projection_plain_text.js";
import {
  BreditorWasmCommandAdapter,
  contentReadPortsForAdapter,
  type WasmContentReadPorts,
  type WasmCommandSequenceOutcome,
} from "./wasm_command_adapter.js";
import {
  bootstrapWasmEngine,
  type WasmBootstrappedEngineView,
  type WasmEngineBootstrapFactoryView,
  type WasmEngineBootstrapModuleView,
} from "./wasm_engine_bootstrap.js";
import type { BrowserDocumentJsonReadResult } from "./wasm_document_json.js";

/** Maximum independent subscribers retained by one high-level editor. */
export const MAX_BROWSER_EDITOR_SUBSCRIBERS = 64;

/** Maximum accessible label length retained by the browser runtime. */
export const MAX_BROWSER_EDITOR_LABEL_UTF16 = 256;

const ACTION_STATE_SNAPSHOT_MISMATCH: ActionStateStoreError = Object.freeze({
  kind: "store",
  code: "action_state.snapshot_mismatch",
  message: "The action-state snapshot does not match the current document.",
});

/** Fresh-document input used only when no stored checkpoint exists. */
export interface BreditorBrowserInitialDocument {
  readonly lineageId: string;
  readonly documentJson: string;
  readonly historyCapacity: number;
}

/** Optional, dedicated toolbar mount. The default manifest is used when omitted. */
export interface BreditorBrowserToolbarOptions {
  readonly host: HTMLElement;
  readonly manifest?: ToolbarManifest;
}

/** Generated static factory shape accepted by the high-level runtime. */
export interface BreditorBrowserWasmFactory {
  fromDocumentJson(
    lineageId: string,
    documentJson: string,
    historyCapacity: number,
  ): unknown;
  fromSessionCheckpointJson(checkpointJson: string): unknown;
}

/** Initialized generated module namespace accepted with ABI/version probes. */
export interface BreditorBrowserWasmModule {
  readonly BreditorEngine: BreditorBrowserWasmFactory;
  breditorWasmAbiVersion(): string;
  breditorVersion(): string;
}

/** Atomic one-slot persistence configuration for the first browser release. */
export interface BreditorBrowserEditorPersistenceOptions {
  readonly indexedDB: IDBFactory;
  readonly crypto: Pick<SubtleCrypto, "digest">;
  /** Progress callback for a blocked IndexedDB open; failures are contained. */
  readonly onBlocked?: () => void;
  readonly autosave?: SessionCheckpointAutosaveOptions;
}

/** Complete construction policy for one framework-neutral browser editor. */
export interface BreditorBrowserEditorOptions {
  /** Connected, initially empty, dedicated light-DOM editing host. */
  readonly host: HTMLElement;
  /** Accessible name installed as `aria-label` on the editing host. */
  readonly label: string;
  /** Initialized generated module namespace, or its exact static engine factory. */
  readonly wasm: BreditorBrowserWasmModule | BreditorBrowserWasmFactory;
  /** Used only when persistence is disabled or its exact slot is empty. */
  readonly initialDocument: BreditorBrowserInitialDocument;
  readonly keyboard: KeyboardTranslationPolicy;
  readonly toolbar?: BreditorBrowserToolbarOptions;
  readonly persistence?: BreditorBrowserEditorPersistenceOptions;
  /** Optional task scheduler used by native composition settlement. */
  readonly scheduleTask?: (callback: () => void) => void;
  /** Cancels asynchronous startup. It does not dispose an opened editor. */
  readonly signal?: AbortSignal;
  /** Defaults to true. */
  readonly spellcheck?: boolean;
}

/** Stable payload-redacted runtime failure. */
export type BreditorBrowserEditorFaultReason =
  | "eventDispatchFailed"
  | "queueUncertain"
  | "reconciliationFailed"
  | "toolbarDispatchFailed"
  | "toolbarPresentationFailed";

/** Observable lifecycle of an editor returned from successful startup. */
export type BreditorBrowserEditorStatus =
  | Readonly<{ phase: "live" }>
  | Readonly<{ phase: "faulted"; reason: BreditorBrowserEditorFaultReason }>
  | Readonly<{ phase: "disposed" }>;

/** Persistence state when no IndexedDB owner was requested. */
export type BreditorBrowserEditorPersistenceStatus =
  | Readonly<{ phase: "disabled"; dirty: false }>
  | SessionCheckpointAutosaveStatus;

/** Stable immutable external-store snapshot for framework subscriptions. */
export interface BreditorBrowserDocumentSnapshot {
  readonly lineage: string;
  readonly revision: string;
}

/** Stable immutable external-store snapshot for framework subscriptions. */
export interface BreditorBrowserEditorSnapshot {
  readonly status: BreditorBrowserEditorStatus;
  readonly document: BreditorBrowserDocumentSnapshot;
  readonly actionState: ActionStateStoreStatus;
  readonly actions: BrowserActionStateSnapshot | undefined;
  readonly persistence: BreditorBrowserEditorPersistenceStatus;
}

/** Notification-only listener compatible with `useSyncExternalStore`. */
export type BreditorBrowserEditorSubscriber = () => unknown;

/** Controlled startup error. Document and checkpoint payloads never escape here. */
export interface BreditorBrowserEditorOpenError {
  readonly code:
    | "browser_editor.invalid_options"
    | "browser_editor.host_in_use"
    | "browser_editor.aborted"
    | "browser_editor.persistence_load_failed"
    | "browser_editor.engine_bootstrap_failed"
    | "browser_editor.initial_render_failed"
    | "browser_editor.initial_selection_failed"
    | "browser_editor.action_state_failed"
    | "browser_editor.setup_failed";
  readonly message: string;
  /** Stable nested boundary code, when one was available. */
  readonly causeCode?: string;
}

/** All-or-nothing asynchronous startup outcome. */
export type BreditorBrowserEditorOpenResult =
  | Readonly<{ ok: true; editor: BreditorBrowserEditor }>
  | Readonly<{ ok: false; error: BreditorBrowserEditorOpenError }>;

/** Explicit persistence operation when storage was not configured. */
export type BreditorBrowserEditorPersistenceResult =
  SessionCheckpointAutosaveFlushResult | Readonly<{ status: "disabled" }>;

/** Explicit public content representations. No editor state is implied. */
export type BreditorBrowserContentFormat = "documentJson" | "plainText";

/** Snapshot-correlated, bounded content copied out of the Rust-owned session. */
export interface BreditorBrowserContentExport<
  Format extends BreditorBrowserContentFormat = BreditorBrowserContentFormat,
> {
  readonly ok: true;
  readonly format: Format;
  readonly value: string;
  readonly utf8Bytes: number;
  readonly snapshot: BreditorBrowserDocumentSnapshot;
}

/** Stable payload-redacted content-export failure. */
export type BreditorBrowserContentExportError =
  | Readonly<{
      kind: "request";
      code: "content_export.invalid_format";
      message: "The requested content export format is invalid.";
    }>
  | Readonly<{
      kind: "lifecycle";
      code: "content_export.busy";
      message: "The editor is temporarily busy and cannot export content.";
    }>
  | Readonly<{
      kind: "lifecycle";
      code: "content_export.unavailable";
      message: "Authoritative editor content is unavailable.";
    }>
  | Readonly<{
      kind: "boundary";
      code: "content_export.invalid_wasm_view";
      message: "The Wasm document export was invalid.";
    }>
  | Readonly<{
      kind: "boundary";
      code: "content_export.invalid_projection";
      message: "The semantic plain-text projection was invalid.";
    }>
  | Readonly<{
      kind: "core";
      code: "content_export.core_rejected";
      message: "The Rust editor core could not export content.";
    }>;

/** Synchronous, deeply immutable content export result. */
export type BreditorBrowserContentExportResult<
  Format extends BreditorBrowserContentFormat = BreditorBrowserContentFormat,
> =
  | Readonly<BreditorBrowserContentExport<Format>>
  | Readonly<{ ok: false; error: BreditorBrowserContentExportError }>;

interface NormalizedAbortSignal {
  readonly isAborted: () => boolean;
  readonly add: (listener: () => void) => void;
  readonly remove: (listener: () => void) => void;
}

interface NormalizedOptions {
  readonly host: HTMLElement;
  readonly label: string;
  readonly wasm: WasmEngineBootstrapModuleView | WasmEngineBootstrapFactoryView;
  readonly initialDocument: BreditorBrowserInitialDocument;
  readonly keyboard: KeyboardTranslationPolicy;
  readonly toolbar:
    | Readonly<{
        host: HTMLElement;
        manifest: ToolbarManifest;
      }>
    | undefined;
  readonly persistence: BreditorBrowserEditorPersistenceOptions | undefined;
  readonly scheduleTask: ((callback: () => void) => void) | undefined;
  readonly signal: NormalizedAbortSignal | undefined;
  readonly spellcheck: boolean;
}

interface HostAttributeSnapshot {
  readonly name: string;
  readonly value: string | null;
}

interface SubscriberSlot {
  readonly listener: BreditorBrowserEditorSubscriber;
  references: number;
}

interface RuntimeResources {
  readonly host: HTMLElement;
  readonly hostAttributes: readonly HostAttributeSnapshot[];
  readonly engine: WasmBootstrappedEngineView;
  readonly adapter: BreditorWasmCommandAdapter;
  readonly contentReadPorts: Readonly<WasmContentReadPorts>;
  readonly selectionBridge: BreditorDomSelectionBridge;
  readonly actionStore: BreditorActionStateStore;
  readonly queue: BreditorCommandQueue<WasmCommandSequenceOutcome>;
  readonly storage: IndexedDbSessionCheckpointStore | undefined;
  readonly autosave:
    | BreditorSessionCheckpointAutosave<IndexedDbSessionCheckpointCasToken>
    | undefined;
}

const LIVE_STATUS: BreditorBrowserEditorStatus = Object.freeze({
  phase: "live",
});
const DISPOSED_STATUS: BreditorBrowserEditorStatus = Object.freeze({
  phase: "disposed",
});
const PERSISTENCE_DISABLED: BreditorBrowserEditorPersistenceStatus =
  Object.freeze({
    phase: "disabled",
    dirty: false,
  });
const PERSISTENCE_DISABLED_RESULT: BreditorBrowserEditorPersistenceResult =
  Object.freeze({ status: "disabled" });
const INVALID_CONTENT_FORMAT: BreditorBrowserContentExportError = Object.freeze({
  kind: "request",
  code: "content_export.invalid_format",
  message: "The requested content export format is invalid.",
});
const CONTENT_BUSY: BreditorBrowserContentExportError = Object.freeze({
  kind: "lifecycle",
  code: "content_export.busy",
  message: "The editor is temporarily busy and cannot export content.",
});
const CONTENT_UNAVAILABLE: BreditorBrowserContentExportError = Object.freeze({
  kind: "lifecycle",
  code: "content_export.unavailable",
  message: "Authoritative editor content is unavailable.",
});
const INVALID_CONTENT_WASM_VIEW: BreditorBrowserContentExportError =
  Object.freeze({
    kind: "boundary",
    code: "content_export.invalid_wasm_view",
    message: "The Wasm document export was invalid.",
  });
const INVALID_CONTENT_PROJECTION: BreditorBrowserContentExportError =
  Object.freeze({
    kind: "boundary",
    code: "content_export.invalid_projection",
    message: "The semantic plain-text projection was invalid.",
  });
const CONTENT_CORE_REJECTED: BreditorBrowserContentExportError = Object.freeze({
  kind: "core",
  code: "content_export.core_rejected",
  message: "The Rust editor core could not export content.",
});
const NOOP_UNSUBSCRIBE = Object.freeze((): void => {});
const EDITOR_HOSTS = new WeakMap<HTMLElement, object>();
const BROWSER_EDITOR_CONSTRUCTION = Object.freeze({});
const EDITOR_ATTRIBUTES = Object.freeze([
  "contenteditable",
  "role",
  "aria-label",
  "aria-multiline",
  "aria-disabled",
  "spellcheck",
  "inert",
  "data-breditor-editor-root",
]);
const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_CATCH = Promise.prototype.catch;
const IGNORE_SETTLEMENT = (): undefined => undefined;
const ACTION_STORE_DISPOSE = BreditorActionStateStore.prototype.dispose;
const ROUTER_DISPOSE = BreditorBrowserEventRouter.prototype.dispose;
const QUEUE_DISPOSE = BreditorCommandQueue.prototype.dispose;
const SELECTION_BRIDGE_DISPOSE = BreditorDomSelectionBridge.prototype.dispose;
const STORAGE_CLOSE = IndexedDbSessionCheckpointStore.prototype.close;
const AUTOSAVE_DISPOSE = BreditorSessionCheckpointAutosave.prototype.dispose;
const TOOLBAR_DISPOSE = BreditorToolbar.prototype.dispose;
const ADAPTER_DISPOSE = BreditorWasmCommandAdapter.prototype.dispose;

/**
 * Single public owner for one Breditor engine and its browser capabilities.
 *
 * The Rust AST is authoritative. Native DOM, selection, toolbar state, event
 * receipts, and persisted checkpoints are projections or observations owned by
 * this object. Callers cannot obtain the generated engine, observation, queue,
 * renderer, or delivery tokens from a successful runtime.
 */
export class BreditorBrowserEditor {
  readonly #ownership = Object.freeze({});
  readonly #host: HTMLElement;
  readonly #hostAttributes: readonly HostAttributeSnapshot[];
  readonly #engine: WasmBootstrappedEngineView;
  readonly #adapter: BreditorWasmCommandAdapter;
  readonly #readDocumentJson: BreditorWasmCommandAdapter["documentJsonReadPort"]["read"];
  readonly #readPlainText: BreditorWasmCommandAdapter["plainTextReadPort"]["read"];
  readonly #selectionBridge: BreditorDomSelectionBridge;
  readonly #actionStore: BreditorActionStateStore;
  readonly #queue: BreditorCommandQueue<WasmCommandSequenceOutcome>;
  readonly #storage: IndexedDbSessionCheckpointStore | undefined;
  readonly #autosave:
    | BreditorSessionCheckpointAutosave<IndexedDbSessionCheckpointCasToken>
    | undefined;
  readonly #subscribers: SubscriberSlot[] = [];

  #toolbar: BreditorToolbar | undefined;
  #router: BreditorBrowserEventRouter | undefined;
  #releaseToolbarStatus: (() => void) | undefined;
  #releaseRouterStatus: (() => void) | undefined;
  #releaseActionState: (() => void) | undefined;
  #releaseActionCommit: (() => void) | undefined;
  #releaseAutosaveCommit: (() => void) | undefined;
  #releaseAutosaveStatus: (() => void) | undefined;
  #status: BreditorBrowserEditorStatus = LIVE_STATUS;
  #snapshot: BreditorBrowserEditorSnapshot;
  #actionRefreshScheduled = false;
  #notificationScheduled = false;
  #physicalDisposeScheduled = false;
  #physicallyDisposed = false;
  #terminalSubscribers: readonly SubscriberSlot[] = Object.freeze([]);

  private constructor(token: object, resources: RuntimeResources) {
    if (token !== BROWSER_EDITOR_CONSTRUCTION) {
      throw new TypeError(
        "BreditorBrowserEditor must be opened through its factory",
      );
    }
    this.#host = resources.host;
    this.#hostAttributes = resources.hostAttributes;
    this.#engine = resources.engine;
    this.#adapter = resources.adapter;
    this.#readDocumentJson = resources.contentReadPorts.documentJson.read;
    this.#readPlainText = resources.contentReadPorts.plainText.read;
    this.#selectionBridge = resources.selectionBridge;
    this.#actionStore = resources.actionStore;
    this.#queue = resources.queue;
    this.#storage = resources.storage;
    this.#autosave = resources.autosave;
    this.#snapshot = this.#readSnapshot();
  }

  /** All-or-nothing startup. No event listener survives a failed result. */
  static async open(
    options: BreditorBrowserEditorOptions,
  ): Promise<BreditorBrowserEditorOpenResult> {
    if (optionNamesOwnedHost(options)) {
      return openFailure("browser_editor.host_in_use");
    }
    const normalized = normalizeOptions(options);
    if (normalized === null)
      return openFailure("browser_editor.invalid_options");
    if (EDITOR_HOSTS.has(normalized.host)) {
      return openFailure("browser_editor.host_in_use");
    }

    const reservation = Object.freeze({});
    EDITOR_HOSTS.set(normalized.host, reservation);
    let hostAttributes: readonly HostAttributeSnapshot[] | undefined;
    let storage: IndexedDbSessionCheckpointStore | undefined;
    let engine: WasmBootstrappedEngineView | undefined;
    let observation:
      ReturnType<WasmBootstrappedEngineView["observation"]> | undefined;
    let renderer: BreditorDomRenderer | undefined;
    let rendered: RenderedProjection | undefined;
    let selectionBridge: BreditorDomSelectionBridge | undefined;
    let adapter: BreditorWasmCommandAdapter | undefined;
    let actionStore: BreditorActionStateStore | undefined;
    let queue: BreditorCommandQueue<WasmCommandSequenceOutcome> | undefined;
    let autosave:
      | BreditorSessionCheckpointAutosave<IndexedDbSessionCheckpointCasToken>
      | undefined;
    let editor: BreditorBrowserEditor | undefined;
    let transferred = false;

    try {
      if (normalized.signal?.isAborted() === true) {
        return openFailure("browser_editor.aborted");
      }

      let loaded: IndexedDbSessionCheckpointLoadResult | undefined;
      if (normalized.persistence !== undefined) {
        storage = new IndexedDbSessionCheckpointStore(normalized.persistence);
        const load = await loadUntilAbort(storage, normalized.signal);
        if (load.kind === "aborted") {
          return openFailure("browser_editor.aborted");
        }
        if (load.kind === "failed") {
          return openFailure(
            "browser_editor.persistence_load_failed",
            load.causeCode,
          );
        }
        loaded = load.result;
        if (!loaded.ok) {
          return openFailure(
            "browser_editor.persistence_load_failed",
            loaded.error.code,
          );
        }
      }

      if (normalized.signal?.isAborted() === true) {
        return openFailure("browser_editor.aborted");
      }
      // The only await in startup occurs above. Re-prove that application code
      // did not populate, detach, or replace either dedicated mount meanwhile.
      if (
        EDITOR_HOSTS.get(normalized.host) !== reservation ||
        !usableEmptyHost(normalized.host) ||
        (normalized.toolbar !== undefined &&
          !usableEmptyHost(normalized.toolbar.host))
      ) {
        return openFailure("browser_editor.setup_failed");
      }

      const bootstrap = bootstrapWasmEngine(
        normalized.wasm,
        loaded?.ok === true && loaded.status === "loaded"
          ? Object.freeze({
              kind: "sessionCheckpoint" as const,
              checkpointJson: loaded.checkpointJson,
            })
          : Object.freeze({
              kind: "document" as const,
              lineageId: normalized.initialDocument.lineageId,
              documentJson: normalized.initialDocument.documentJson,
              historyCapacity: normalized.initialDocument.historyCapacity,
            }),
      );
      if (!bootstrap.ok) {
        return openFailure(
          "browser_editor.engine_bootstrap_failed",
          bootstrap.error.code,
        );
      }
      engine = bootstrap.engine;
      observation = bootstrap.observation;

      const capturedHostAttributes = snapshotHostAttributes(normalized.host);
      if (capturedHostAttributes === null) {
        return openFailure("browser_editor.setup_failed");
      }
      hostAttributes = capturedHostAttributes;
      if (!installHostAttributes(normalized)) {
        return openFailure("browser_editor.setup_failed");
      }

      renderer = new BreditorDomRenderer();
      const initialRender = renderer.render(
        normalized.host,
        bootstrap.projection,
      );
      if (!initialRender.ok) {
        return openFailure(
          "browser_editor.initial_render_failed",
          initialRender.error.code,
        );
      }
      rendered = initialRender.value.rendered;
      selectionBridge = new BreditorDomSelectionBridge();
      adapter = new BreditorWasmCommandAdapter(engine, observation, {
        renderer,
        rendered,
        selectionBridge,
      });
      observation = undefined;
      rendered = undefined;
      const contentReadPorts = contentReadPortsForAdapter(adapter);
      if (contentReadPorts === undefined) {
        return openFailure("browser_editor.setup_failed");
      }

      const restored = adapter.restoreCanonicalRender();
      if (!restored.ok) {
        return openFailure(
          "browser_editor.initial_selection_failed",
          initialSelectionCauseCode(restored.reason),
        );
      }

      actionStore = new BreditorActionStateStore(adapter.actionStateReadPort);
      const initialActions = actionStore.refresh();
      if (
        initialActions.status === "failed" ||
        initialActions.status === "rejected"
      ) {
        return openFailure(
          "browser_editor.action_state_failed",
          initialActions.status === "failed"
            ? initialActions.error.code
            : initialActions.reason,
        );
      }

      queue = new BreditorCommandQueue(adapter.commandExecutor, {
        // A completed delivery must make action state revision-coherent before
        // submit() returns. The core-commit microtask below remains the fallback
        // for a commit which publishes before a later adapter/render failure.
        observer: actionStore.queueObserver,
      });
      if (storage !== undefined && loaded?.ok === true) {
        autosave = new BreditorSessionCheckpointAutosave(
          adapter.sessionCheckpointReadPort,
          storage,
          loaded.token,
          normalized.persistence?.autosave,
        );
      }

      editor = new BreditorBrowserEditor(BROWSER_EDITOR_CONSTRUCTION, {
        host: normalized.host,
        hostAttributes,
        engine,
        adapter,
        contentReadPorts,
        selectionBridge,
        actionStore,
        queue,
        storage,
        autosave,
      });
      EDITOR_HOSTS.set(normalized.host, editor.#ownership);
      editor.#installCoreObservers();
      if (normalized.toolbar !== undefined) {
        editor.#installToolbar(
          normalized.toolbar.host,
          normalized.toolbar.manifest,
        );
      }
      editor.#installRouter(normalized.keyboard, normalized.scheduleTask);
      if (normalized.signal?.isAborted() === true) {
        editor.#dispose();
        return openFailure("browser_editor.aborted");
      }

      transferred = true;
      return Object.freeze({ ok: true, editor });
    } catch {
      return openFailure("browser_editor.setup_failed");
    } finally {
      if (!transferred) {
        if (editor !== undefined) {
          editor.#dispose();
        } else {
          bestEffortIntrinsic(autosave, AUTOSAVE_DISPOSE);
          bestEffortIntrinsic(queue, QUEUE_DISPOSE);
          bestEffortIntrinsic(actionStore, ACTION_STORE_DISPOSE);
          bestEffortIntrinsic(adapter, ADAPTER_DISPOSE);
          if (
            adapter === undefined &&
            rendered !== undefined &&
            renderer !== undefined
          ) {
            try {
              renderer.release(rendered);
            } catch {
              // Startup failure remains authoritative.
            }
          }
          bestEffortIntrinsic(selectionBridge, SELECTION_BRIDGE_DISPOSE);
          if (observation !== undefined) bestEffortFree(observation);
          if (engine !== undefined) bestEffortFree(engine);
          bestEffortIntrinsic(storage, STORAGE_CLOSE);
          if (hostAttributes !== undefined) {
            clearOwnedHost(normalized.host);
            restoreHostAttributes(normalized.host, hostAttributes);
          }
        }
        if (EDITOR_HOSTS.get(normalized.host) === reservation) {
          EDITOR_HOSTS.delete(normalized.host);
        }
      }
    }
  }

  /** Dedicated editing element owned until disposal. */
  get element(): HTMLElement {
    return this.#host;
  }

  /** Current immutable lifecycle. */
  getStatus(): BreditorBrowserEditorStatus {
    return this.#status;
  }

  /** Stable immutable external-store snapshot. */
  getSnapshot(): BreditorBrowserEditorSnapshot {
    return this.#snapshot;
  }

  /**
   * Copies authoritative content without exposing engine state or Wasm handles.
   *
   * `documentJson` is the lossless canonical Document V1 record. `plainText`
   * joins semantic paragraphs with LF and strips formatting; it never reads
   * mutable DOM text. Busy composition/delivery/read leases fail benignly.
   */
  exportContent(
    format: "documentJson",
  ): BreditorBrowserContentExportResult<"documentJson">;
  exportContent(
    format: "plainText",
  ): BreditorBrowserContentExportResult<"plainText">;
  exportContent(
    format: BreditorBrowserContentFormat,
  ): BreditorBrowserContentExportResult;
  exportContent(
    format: BreditorBrowserContentFormat,
  ): BreditorBrowserContentExportResult {
    if (format !== "documentJson" && format !== "plainText") {
      return contentFailure(INVALID_CONTENT_FORMAT);
    }
    if (this.#status.phase === "disposed") {
      return contentFailure(CONTENT_UNAVAILABLE);
    }

    let before: BreditorBrowserDocumentSnapshot;
    let state: BreditorWasmCommandAdapter["state"];
    try {
      state = this.#adapter.state;
      before = this.#adapter.snapshot;
    } catch {
      return contentFailure(CONTENT_UNAVAILABLE);
    }
    if (adapterStateIsContentBusy(state)) {
      return contentFailure(CONTENT_BUSY);
    }
    if (state !== "live" && state !== "reconcile") {
      return contentFailure(CONTENT_UNAVAILABLE);
    }

    const result =
      format === "documentJson"
        ? this.#readDocumentJson()
        : this.#readPlainText();
    if (result === undefined) {
      return this.#isDisposed()
        ? contentFailure(CONTENT_UNAVAILABLE)
        : contentFailure(CONTENT_BUSY);
    }

    // A hostile generated getter may synchronously dispose the public owner.
    // Discard its provisional bytes and let bounded physical teardown unwind.
    let after: BreditorBrowserDocumentSnapshot;
    let afterState: BreditorWasmCommandAdapter["state"];
    try {
      afterState = this.#adapter.state;
      after = this.#adapter.snapshot;
    } catch {
      return contentFailure(CONTENT_UNAVAILABLE);
    }
    if (
      this.#isDisposed() ||
      (afterState !== "live" && afterState !== "reconcile")
    ) {
      return contentFailure(CONTENT_UNAVAILABLE);
    }

    return format === "documentJson"
      ? contentExportFromDocumentJson(result as BrowserDocumentJsonReadResult, before, after)
      : contentExportFromPlainText(result as BrowserProjectionPlainTextResult, before, after);
  }

  #isDisposed(): boolean {
    return this.#status.phase === "disposed";
  }

  /** Bounded, duplicate-idempotent subscription for framework adapters. */
  subscribe(listener: BreditorBrowserEditorSubscriber): () => void {
    if (typeof listener !== "function") {
      throw new TypeError("browser editor subscriber must be callable");
    }
    if (this.#status.phase === "disposed") return NOOP_UNSUBSCRIBE;
    let slot = this.#subscribers.find(
      (candidate) => candidate.listener === listener,
    );
    if (slot === undefined) {
      if (this.#subscribers.length >= MAX_BROWSER_EDITOR_SUBSCRIBERS) {
        throw new RangeError("browser editor subscriber capacity is exhausted");
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

  /** Forces the currently dirty checkpoint epoch to its controlled outcome. */
  async flushPersistence(): Promise<BreditorBrowserEditorPersistenceResult> {
    const result = await (this.#autosave?.flush() ??
      PROMISE_RESOLVE(PERSISTENCE_DISABLED_RESULT));
    // Awaiters must observe the settlement and matching status atomically.
    this.#publish();
    return result;
  }

  /** Explicitly resumes paused persistence and flushes current dirtiness. */
  async retryPersistence(): Promise<BreditorBrowserEditorPersistenceResult> {
    const result = await (this.#autosave?.retry() ??
      PROMISE_RESOLVE(PERSISTENCE_DISABLED_RESULT));
    this.#publish();
    return result;
  }

  /** Focuses the live editing host, reporting failure instead of throwing. */
  focus(): boolean {
    if (this.#status.phase !== "live") return false;
    try {
      this.#host.focus();
      const focused = this.#host.ownerDocument.activeElement === this.#host;
      return this.#status.phase === "live" && focused;
    } catch {
      return false;
    }
  }

  /**
   * Stops native input and invalidates every public capability immediately.
   * Physical teardown may wait one microtask for a reentrant engine call.
   *
   * Disposal does not wait for or imply an autosave. Call and await
   * `flushPersistence()` before controlled navigation when durability matters.
   */
  dispose(): void {
    this.#dispose();
  }

  #dispose(): void {
    if (this.#status.phase === "disposed") return;
    this.#status = DISPOSED_STATUS;
    this.#terminalSubscribers = Object.freeze(this.#subscribers.slice());
    this.#subscribers.length = 0;

    bestEffortCall(this.#releaseRouterStatus);
    this.#releaseRouterStatus = undefined;
    bestEffortIntrinsic(this.#router, ROUTER_DISPOSE);
    this.#router = undefined;
    bestEffortCall(this.#releaseToolbarStatus);
    this.#releaseToolbarStatus = undefined;
    bestEffortIntrinsic(this.#toolbar, TOOLBAR_DISPOSE);
    this.#toolbar = undefined;
    bestEffortCall(this.#releaseActionCommit);
    this.#releaseActionCommit = undefined;
    bestEffortCall(this.#releaseAutosaveCommit);
    this.#releaseAutosaveCommit = undefined;
    bestEffortCall(this.#releaseAutosaveStatus);
    this.#releaseAutosaveStatus = undefined;
    bestEffortCall(this.#releaseActionState);
    this.#releaseActionState = undefined;
    bestEffortIntrinsic(this.#autosave, AUTOSAVE_DISPOSE);
    bestEffortIntrinsic(this.#actionStore, ACTION_STORE_DISPOSE);
    bestEffortIntrinsic(this.#queue, QUEUE_DISPOSE);
    // Publish the logical terminal state immediately. Physical adapter/engine
    // teardown may need one microtask when disposal was requested reentrantly
    // from an in-flight synchronous engine callback.
    this.#snapshot = this.#readSnapshot();
    this.#finishPhysicalDisposal();
  }

  #finishPhysicalDisposal(afterSynchronousUnwind = false): void {
    if (this.#physicallyDisposed) return;
    if (adapterIsBusy(this.#adapter)) {
      if (!afterSynchronousUnwind && !this.#physicalDisposeScheduled) {
        this.#physicalDisposeScheduled = true;
        enqueueMicrotask(() => {
          this.#physicalDisposeScheduled = false;
          this.#finishPhysicalDisposal(true);
        });
        return;
      }
      // One microtask is enough for every supported synchronous read/delivery.
      // If the adapter still claims to be busy (or its state is unreadable),
      // terminate external ownership without spinning: retain the adapter and
      // engine rather than freeing memory beneath a possibly live handle.
    } else {
      bestEffortIntrinsic(this.#adapter, ADAPTER_DISPOSE);
    }

    // Adapter cleanup precedes engine cleanup. If an implementation defect or
    // prototype patch leaves the adapter live, retain (leak) the engine rather
    // than freeing it beneath an owner which could still hold observations.
    const adapterDisposed = adapterIsDisposed(this.#adapter);
    if (adapterDisposed) {
      bestEffortIntrinsic(this.#selectionBridge, SELECTION_BRIDGE_DISPOSE);
      bestEffortFree(this.#engine);
    }
    bestEffortIntrinsic(this.#storage, STORAGE_CLOSE);
    this.#snapshot = this.#readSnapshot();
    clearOwnedHost(this.#host);
    restoreHostAttributes(this.#host, this.#hostAttributes);
    if (EDITOR_HOSTS.get(this.#host) === this.#ownership) {
      EDITOR_HOSTS.delete(this.#host);
    }
    this.#physicallyDisposed = true;
    const terminalSubscribers = this.#terminalSubscribers;
    this.#terminalSubscribers = Object.freeze([]);
    notifySlots(terminalSubscribers);
  }

  #installCoreObservers(): void {
    this.#releaseActionState = this.#actionStore.subscribe(() =>
      this.#publish(),
    );
    this.#releaseActionCommit = this.#adapter.observeCoreCommits(() => {
      this.#scheduleActionRefresh();
    });
    if (this.#autosave !== undefined) {
      this.#releaseAutosaveCommit = this.#adapter.observeCoreCommits(
        this.#autosave.commitObserver,
      );
      this.#releaseAutosaveStatus = this.#autosave.observeStatus(() =>
        this.#publish(),
      );
    }
  }

  #installToolbar(host: HTMLElement, manifest: ToolbarManifest): void {
    const toolbar = new BreditorToolbar(host, manifest, this.#actionStore, {
      dispatch: (invocation) => this.#dispatchToolbar(invocation),
    });
    if (toolbar.state !== "live") {
      toolbar.dispose();
      throw new TypeError("toolbar faulted during installation");
    }
    this.#toolbar = toolbar;
    this.#releaseToolbarStatus = toolbar.subscribe((state) =>
      this.#observeToolbarStatus(state),
    );
    if (toolbar.state !== "live") {
      bestEffortCall(this.#releaseToolbarStatus);
      this.#releaseToolbarStatus = undefined;
      bestEffortIntrinsic(toolbar, TOOLBAR_DISPOSE);
      this.#toolbar = undefined;
      throw new TypeError("toolbar faulted during installation");
    }
  }

  #installRouter(
    keyboard: KeyboardTranslationPolicy,
    scheduleTask: ((callback: () => void) => void) | undefined,
  ): void {
    const router = new BreditorBrowserEventRouter(this.#queue, this.#adapter, {
      keyboard,
      ...(scheduleTask === undefined ? {} : { scheduleTask }),
    });
    this.#router = router;
    this.#releaseRouterStatus = router.subscribe((status) =>
      this.#observeRouterStatus(status),
    );
    this.#observeRouterStatus(router.status);
  }

  #dispatchToolbar(
    invocation: ToolbarCommandInvocation,
  ): ToolbarCommandDispatchResult {
    if (this.#status.phase !== "live") {
      return toolbarCommandDispatchResult("rejected");
    }
    try {
      const adapterState = this.#adapter.state;
      if (
        adapterState === "composition" ||
        adapterState === "executing" ||
        adapterState === "readingActionState" ||
        adapterState === "readingCheckpoint" ||
        adapterState === "readingContent"
      ) {
        // These states are temporary, exclusive leases rather than evidence of
        // uncertainty. In particular, pointerdown intentionally preserves an
        // active IME composition, so a toolbar click must fail benignly until
        // the native composition settles.
        return toolbarCommandDispatchResult("rejected");
      }
      const request = toolbarCommandRequest(
        this.#adapter.deliveryToken(),
        invocation,
      );
      const submission = this.#queue.submit(request);
      if (submission.status === "completed") {
        return toolbarCommandDispatchResult("completed");
      }
      if (
        submission.status === "rejected" &&
        submission.reason !== "failed" &&
        submission.reason !== "disposed"
      ) {
        return toolbarCommandDispatchResult("rejected");
      }
    } catch {
      // The single failure transition below is authoritative.
    }
    this.#fault("toolbarDispatchFailed");
    return toolbarCommandDispatchResult("failed");
  }

  #observeRouterStatus(status: BrowserEventRouterStatus): void {
    if (status.kind === "faulted") {
      this.#fault(routerReason(status.reason));
    }
  }

  #observeToolbarStatus(state: "live" | "faulted" | "disposed"): void {
    if (state === "faulted") {
      this.#fault("toolbarPresentationFailed");
    }
  }

  #fault(reason: BreditorBrowserEditorFaultReason): void {
    if (this.#status.phase !== "live") return;
    this.#status = Object.freeze({ phase: "faulted", reason });
    bestEffortCall(this.#releaseToolbarStatus);
    this.#releaseToolbarStatus = undefined;
    bestEffortIntrinsic(this.#toolbar, TOOLBAR_DISPOSE);
    this.#toolbar = undefined;
    bestEffortIntrinsic(this.#router, ROUTER_DISPOSE);
    bestEffortIntrinsic(this.#queue, QUEUE_DISPOSE);
    quiesceFaultedHost(this.#host);
    this.#publish();
  }

  #scheduleActionRefresh(): void {
    if (this.#actionRefreshScheduled || this.#status.phase === "disposed")
      return;
    this.#actionRefreshScheduled = true;
    enqueueMicrotask(() => {
      this.#actionRefreshScheduled = false;
      if (this.#status.phase === "disposed") return;
      try {
        this.#actionStore.refresh();
      } catch {
        // Store status is last-good and the toolbar fails closed when stale.
      }
      this.#publish();
    });
  }

  #publish(): void {
    this.#snapshot = this.#readSnapshot();
    if (this.#notificationScheduled || this.#status.phase === "disposed")
      return;
    this.#notificationScheduled = true;
    enqueueMicrotask(() => {
      this.#notificationScheduled = false;
      if (this.#status.phase === "disposed") return;
      notifySlots(this.#subscribers.slice());
    });
  }

  #readSnapshot(): BreditorBrowserEditorSnapshot {
    let document = this.#snapshot?.document;
    try {
      document = this.#adapter.snapshot;
    } catch {
      document ??= Object.freeze({ lineage: "unavailable", revision: "0" });
    }
    let actionState = this.#snapshot?.actionState;
    let actions = this.#snapshot?.actions;
    try {
      actionState = this.#actionStore.getStatus();
      actions = this.#actionStore.getSnapshot();
    } catch {
      actionState ??= Object.freeze({
        status: "unavailable",
        lastError: undefined,
      });
    }
    if (
      actionState.status === "fresh" &&
      (actions === undefined ||
        actions.snapshot.lineage !== document.lineage ||
        actions.snapshot.revision !== document.revision)
    ) {
      actionState = Object.freeze({
        status: "stale",
        lastError: ACTION_STATE_SNAPSHOT_MISMATCH,
      });
    }
    let persistence: BreditorBrowserEditorPersistenceStatus =
      PERSISTENCE_DISABLED;
    try {
      persistence = this.#autosave?.getStatus() ?? PERSISTENCE_DISABLED;
    } catch {
      persistence = this.#snapshot?.persistence ?? PERSISTENCE_DISABLED;
    }
    return Object.freeze({
      status: this.#status,
      document,
      actionState,
      actions,
      persistence,
    });
  }
}

/** Function-form ergonomic alias for `BreditorBrowserEditor.open`. */
export function openBreditorBrowserEditor(
  options: BreditorBrowserEditorOptions,
): Promise<BreditorBrowserEditorOpenResult> {
  return BreditorBrowserEditor.open(options);
}

function contentExportFromDocumentJson(
  result: BrowserDocumentJsonReadResult,
  before: BreditorBrowserDocumentSnapshot,
  after: BreditorBrowserDocumentSnapshot,
): BreditorBrowserContentExportResult<"documentJson"> {
  if (!result.ok) {
    if (result.error.kind === "core") {
      return contentFailure(CONTENT_CORE_REJECTED);
    }
    return contentFailure(
      result.error.kind === "lifecycle"
        ? CONTENT_UNAVAILABLE
        : INVALID_CONTENT_WASM_VIEW,
    );
  }
  const exported = result.document;
  if (
    !snapshotsMatch(before, after) ||
    !snapshotsMatch(exported.snapshot, before)
  ) {
    return contentFailure(INVALID_CONTENT_WASM_VIEW);
  }
  return Object.freeze({
    ok: true,
    format: "documentJson",
    value: exported.documentJson,
    utf8Bytes: exported.documentUtf8Bytes,
    snapshot: exported.snapshot,
  });
}

function contentExportFromPlainText(
  result: BrowserProjectionPlainTextResult,
  before: BreditorBrowserDocumentSnapshot,
  after: BreditorBrowserDocumentSnapshot,
): BreditorBrowserContentExportResult<"plainText"> {
  if (!result.ok) {
    return contentFailure(
      result.error.kind === "lifecycle"
        ? CONTENT_UNAVAILABLE
        : INVALID_CONTENT_PROJECTION,
    );
  }
  const exported = result.content;
  if (
    !snapshotsMatch(before, after) ||
    !snapshotsMatch(exported.snapshot, before)
  ) {
    return contentFailure(INVALID_CONTENT_PROJECTION);
  }
  return Object.freeze({
    ok: true,
    format: "plainText",
    value: exported.text,
    utf8Bytes: exported.utf8Bytes,
    snapshot: exported.snapshot,
  });
}

function contentFailure(
  error: BreditorBrowserContentExportError,
): Extract<BreditorBrowserContentExportResult, Readonly<{ ok: false }>> {
  return Object.freeze({ ok: false, error });
}

function snapshotsMatch(
  left: BreditorBrowserDocumentSnapshot,
  right: BreditorBrowserDocumentSnapshot,
): boolean {
  return left.lineage === right.lineage && left.revision === right.revision;
}

function adapterStateIsContentBusy(
  state: BreditorWasmCommandAdapter["state"],
): boolean {
  return (
    state === "composition" ||
    state === "executing" ||
    state === "readingActionState" ||
    state === "readingCheckpoint" ||
    state === "readingContent"
  );
}

function normalizeOptions(value: unknown): NormalizedOptions | null {
  try {
    if (!objectLike(value)) return null;
    const options = value as unknown as BreditorBrowserEditorOptions;
    const host = options.host;
    const label = options.label;
    const wasm = options.wasm;
    const initial = options.initialDocument;
    const keyboard = options.keyboard;
    const toolbar = options.toolbar;
    const persistence = options.persistence;
    const scheduleTask = options.scheduleTask;
    const signal = options.signal;
    const spellcheck = options.spellcheck ?? true;
    if (
      !usableEmptyHost(host) ||
      typeof label !== "string" ||
      label.length < 1 ||
      label.length > MAX_BROWSER_EDITOR_LABEL_UTF16 ||
      label.trim().length < 1 ||
      !wellFormedUtf16(label) ||
      !objectLike(wasm) ||
      !objectLike(initial) ||
      !validKeyboardPolicy(keyboard) ||
      typeof spellcheck !== "boolean" ||
      (scheduleTask !== undefined && typeof scheduleTask !== "function")
    ) {
      return null;
    }
    const initialDocument = Object.freeze({
      lineageId: initial.lineageId,
      documentJson: initial.documentJson,
      historyCapacity: initial.historyCapacity,
    });
    let normalizedToolbar: NormalizedOptions["toolbar"];
    if (toolbar !== undefined) {
      if (
        !objectLike(toolbar) ||
        toolbar.host === host ||
        !usableEmptyHost(toolbar.host)
      ) {
        return null;
      }
      normalizedToolbar = Object.freeze({
        host: toolbar.host,
        manifest: toolbar.manifest ?? DEFAULT_TOOLBAR_MANIFEST,
      });
    }
    let normalizedPersistence:
      BreditorBrowserEditorPersistenceOptions | undefined;
    if (persistence !== undefined) {
      if (!objectLike(persistence)) return null;
      normalizedPersistence = Object.freeze({
        indexedDB: persistence.indexedDB,
        crypto: persistence.crypto,
        ...(persistence.onBlocked === undefined
          ? {}
          : { onBlocked: persistence.onBlocked }),
        ...(persistence.autosave === undefined
          ? {}
          : { autosave: persistence.autosave }),
      });
    }
    const normalizedSignal = normalizeAbortSignal(signal);
    if (signal !== undefined && normalizedSignal === null) return null;
    return Object.freeze({
      host,
      label,
      // The public high-level shape deliberately returns `unknown`; the
      // bootstrap below performs the complete generated-view validation.
      wasm: wasm as unknown as
        WasmEngineBootstrapModuleView | WasmEngineBootstrapFactoryView,
      initialDocument,
      keyboard: Object.freeze({
        editing: keyboard.editing,
        primaryModifier: keyboard.primaryModifier,
        shortcuts: keyboard.shortcuts,
      }),
      toolbar: normalizedToolbar,
      persistence: normalizedPersistence,
      scheduleTask,
      signal: normalizedSignal ?? undefined,
      spellcheck,
    });
  } catch {
    return null;
  }
}

function normalizeAbortSignal(
  value: unknown,
): NormalizedAbortSignal | null | undefined {
  if (value === undefined) return undefined;
  if (!objectLike(value)) return null;
  try {
    const signal = value as unknown as AbortSignal;
    const add = signal.addEventListener;
    const remove = signal.removeEventListener;
    if (typeof add !== "function" || typeof remove !== "function") return null;
    return Object.freeze({
      isAborted: () => {
        try {
          return signal.aborted === true;
        } catch {
          return true;
        }
      },
      add: (listener: () => void) => {
        Reflect.apply(add, signal, ["abort", listener, { once: true }]);
      },
      remove: (listener: () => void) => {
        Reflect.apply(remove, signal, ["abort", listener]);
      },
    });
  } catch {
    return null;
  }
}

async function loadUntilAbort(
  store: IndexedDbSessionCheckpointStore,
  signal: NormalizedAbortSignal | undefined,
): Promise<
  | Readonly<{ kind: "loaded"; result: IndexedDbSessionCheckpointLoadResult }>
  | Readonly<{ kind: "aborted" }>
  | Readonly<{ kind: "failed"; causeCode: string }>
> {
  if (signal?.isAborted() === true) return Object.freeze({ kind: "aborted" });
  type LoadOutcome =
    | Readonly<{ kind: "loaded"; result: IndexedDbSessionCheckpointLoadResult }>
    | Readonly<{ kind: "failed"; causeCode: string }>;
  const load: Promise<LoadOutcome> = store.load().then(
    (result): LoadOutcome => Object.freeze({ kind: "loaded", result }),
    (): LoadOutcome =>
      Object.freeze({
        kind: "failed",
        causeCode: "session_checkpoint.connection",
      }),
  );
  if (signal === undefined) return load;

  let settleAbort: ((value: Readonly<{ kind: "aborted" }>) => void) | undefined;
  const abort = new Promise<Readonly<{ kind: "aborted" }>>((resolve) => {
    settleAbort = resolve;
  });
  const onAbort = (): void => {
    bestEffortIntrinsic(store, STORAGE_CLOSE);
    settleAbort?.(Object.freeze({ kind: "aborted" }));
  };
  try {
    signal.add(onAbort);
  } catch {
    return Object.freeze({ kind: "aborted" });
  }
  if (signal.isAborted()) onAbort();
  try {
    return await Promise.race([load, abort]);
  } finally {
    try {
      signal.remove(onAbort);
    } catch {
      // Logical startup state does not depend on platform listener cleanup.
    }
  }
}

function usableEmptyHost(value: unknown): value is HTMLElement {
  try {
    if (!objectLike(value)) return false;
    const host = value as unknown as HTMLElement;
    return (
      host.nodeType === 1 &&
      host.namespaceURI === "http://www.w3.org/1999/xhtml" &&
      host.ownerDocument !== null &&
      host.isConnected &&
      host.childNodes.length === 0 &&
      typeof host.replaceChildren === "function" &&
      typeof host.setAttribute === "function"
    );
  } catch {
    return false;
  }
}

function validKeyboardPolicy(
  value: unknown,
): value is KeyboardTranslationPolicy {
  if (!objectLike(value)) return false;
  try {
    const candidate = value as unknown as Partial<KeyboardTranslationPolicy>;
    return (
      (candidate.editing === "beforeinputPrimary" ||
        candidate.editing === "structuralFallback") &&
      (candidate.primaryModifier === "control" ||
        candidate.primaryModifier === "meta") &&
      (candidate.shortcuts === "enabled" || candidate.shortcuts === "disabled")
    );
  } catch {
    return false;
  }
}

function snapshotHostAttributes(
  host: HTMLElement,
): readonly HostAttributeSnapshot[] | null {
  try {
    return Object.freeze(
      EDITOR_ATTRIBUTES.map((name) =>
        Object.freeze({ name, value: host.getAttribute(name) }),
      ),
    );
  } catch {
    return null;
  }
}

function installHostAttributes(options: NormalizedOptions): boolean {
  try {
    // Boolean HTML attributes are enabled by presence, so `inert="false"`
    // would still suppress the supposedly live editor.
    options.host.removeAttribute("inert");
    options.host.setAttribute("contenteditable", "true");
    options.host.setAttribute("role", "textbox");
    options.host.setAttribute("aria-label", options.label);
    options.host.setAttribute("aria-multiline", "true");
    options.host.setAttribute("aria-disabled", "false");
    options.host.setAttribute(
      "spellcheck",
      options.spellcheck ? "true" : "false",
    );
    options.host.setAttribute("data-breditor-editor-root", "");
    return true;
  } catch {
    return false;
  }
}

function restoreHostAttributes(
  host: HTMLElement,
  attributes: readonly HostAttributeSnapshot[],
): void {
  for (const attribute of attributes) {
    try {
      if (attribute.value === null) host.removeAttribute(attribute.name);
      else host.setAttribute(attribute.name, attribute.value);
    } catch {
      // Disposal is terminal even if application DOM hooks throw.
    }
  }
}

function quiesceFaultedHost(host: HTMLElement): void {
  try {
    host.setAttribute("contenteditable", "false");
  } catch {
    // The remaining independent fault guards still run.
  }
  try {
    host.setAttribute("aria-disabled", "true");
  } catch {
    // Accessibility state is best-effort when application DOM hooks throw.
  }
  try {
    host.setAttribute("inert", "");
  } catch {
    // `contenteditable=false` remains the primary native-mutation guard.
  }
  try {
    host.blur();
  } catch {
    // Losing focus is defense in depth after editing is already disabled.
  }
}

function clearOwnedHost(host: HTMLElement): void {
  try {
    host.replaceChildren();
  } catch {
    // Disposal/startup rollback remains terminal.
  }
}

function routerReason(
  reason: BrowserEventRouterFaultReason,
): BreditorBrowserEditorFaultReason {
  return reason;
}

function notifySlots(slots: readonly SubscriberSlot[]): void {
  enqueueMicrotask(() => {
    for (const slot of slots) {
      if (slot.references < 1) continue;
      try {
        containAsyncRejection(Reflect.apply(slot.listener, undefined, []));
      } catch {
        // Subscriber-local failure cannot affect lifecycle or siblings.
      }
    }
  });
}

function enqueueMicrotask(callback: () => void): void {
  const pending = PROMISE_THEN.call(PROMISE_RESOLVE(), callback);
  PROMISE_CATCH.call(pending, IGNORE_SETTLEMENT);
}

function containAsyncRejection(value: unknown): void {
  if (!objectLike(value)) return;
  try {
    const then = (value as Readonly<{ then?: unknown }>).then;
    if (typeof then === "function") {
      const pending = PROMISE_RESOLVE(value);
      PROMISE_CATCH.call(pending, IGNORE_SETTLEMENT);
    }
  } catch {
    // Hostile thenables are subscriber-local too.
  }
}

function adapterIsBusy(adapter: BreditorWasmCommandAdapter): boolean {
  try {
    return (
      adapter.state === "executing" ||
      adapter.state === "readingActionState" ||
      adapter.state === "readingCheckpoint" ||
      adapter.state === "readingContent"
    );
  } catch {
    // An unreadable owned adapter is not safe to tear down underneath.
    return true;
  }
}

function adapterIsDisposed(adapter: BreditorWasmCommandAdapter): boolean {
  try {
    return adapter.state === "disposed";
  } catch {
    return false;
  }
}

function bestEffortIntrinsic(value: unknown, method: unknown): void {
  if (!objectLike(value) || typeof method !== "function") return;
  try {
    containAsyncRejection(Reflect.apply(method, value, []));
  } catch {
    // Cleanup continues with the remaining owners.
  }
}

function bestEffortFree(value: unknown): void {
  if (!objectLike(value)) return;
  try {
    const free = (value as Readonly<{ free?: unknown }>).free;
    if (typeof free === "function") {
      containAsyncRejection(Reflect.apply(free, value, []));
    }
  } catch {
    // Cleanup continues with the remaining owners.
  }
}

function bestEffortCall(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch {
    // Cleanup continues with the remaining owners.
  }
}

function openFailure(
  code: BreditorBrowserEditorOpenError["code"],
  causeCode?: string,
): Extract<BreditorBrowserEditorOpenResult, Readonly<{ ok: false }>> {
  const messages: Readonly<
    Record<BreditorBrowserEditorOpenError["code"], string>
  > = OPEN_ERROR_MESSAGES;
  const error = Object.freeze({
    code,
    message: messages[code],
    ...(stableCauseCode(causeCode) ? { causeCode } : {}),
  });
  return Object.freeze({ ok: false, error });
}

const OPEN_ERROR_MESSAGES: Readonly<
  Record<BreditorBrowserEditorOpenError["code"], string>
> = Object.freeze({
  "browser_editor.invalid_options": "The browser editor options are invalid.",
  "browser_editor.host_in_use":
    "The editing host already has a live Breditor owner.",
  "browser_editor.aborted": "Browser editor startup was aborted.",
  "browser_editor.persistence_load_failed":
    "The persisted session checkpoint could not be loaded safely.",
  "browser_editor.engine_bootstrap_failed":
    "The Rust editor engine could not be initialized safely.",
  "browser_editor.initial_render_failed":
    "The initial semantic document could not be projected into the editing host.",
  "browser_editor.initial_selection_failed":
    "The initial semantic selection could not be restored into the editing host.",
  "browser_editor.action_state_failed":
    "The initial editor action state could not be read safely.",
  "browser_editor.setup_failed":
    "The browser editor runtime could not be installed safely.",
});

function stableCauseCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*$/u.test(value)
  );
}

function wellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const trail = value.charCodeAt(index + 1);
      if (trail < 0xdc00 || trail > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function optionNamesOwnedHost(value: unknown): boolean {
  try {
    if (!objectLike(value)) return false;
    const host = Reflect.get(value, "host", value) as unknown;
    return objectLike(host) && EDITOR_HOSTS.has(host as unknown as HTMLElement);
  } catch {
    return false;
  }
}

function initialSelectionCauseCode(
  reason: "adapterUnavailable" | "renderFailed" | "selectionWriteFailed",
): string {
  switch (reason) {
    case "adapterUnavailable":
      return "browser_editor.adapter_unavailable";
    case "renderFailed":
      return "browser_editor.render_failed";
    case "selectionWriteFailed":
      return "browser_editor.selection_write_failed";
  }
}

function objectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}
