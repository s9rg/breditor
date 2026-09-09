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
import {
  BreditorCommandQueue,
  openCommandQueueLeasePort,
  type CommandQueueLeasePort,
  type CommandQueueLeasedSubmission,
} from "./command_queue.js";
import {
  browserCommandJsonIsAdmissible,
  jsonIntentRequest,
  noInputIntentRequest,
  preserveSelectionSync,
} from "./editor_command.js";
import {
  BreditorDomRenderer,
  type RenderedProjection,
} from "./dom_renderer.js";
import {
  compileBrowserPresentation,
  type BrowserCompiledPresentation,
} from "./compiled_browser_presentation.js";
import {
  DEFAULT_INLINE_FORMAT_RENDER_MANIFEST,
  isOwnedInlineFormatRenderManifest,
  type InlineFormatRenderManifest,
} from "./inline_format_render_manifest.js";
import { BreditorDomSelectionBridge } from "./dom_selection.js";
import {
  IndexedDbSessionCheckpointStore,
  MAX_SESSION_CHECKPOINT_SLOT_ASCII_BYTES,
  type IndexedDbSessionCheckpointCasToken,
  type IndexedDbSessionCheckpointBinding,
  type IndexedDbSessionCheckpointLoadResult,
} from "./indexeddb_session_checkpoint.js";
import {
  isSafeFlowContainerHost,
  nativeBlurHtmlElement,
  nativeDocumentActiveElement,
  nativeFocusHtmlElement,
  nativeGetAttribute,
  nativeHasAttribute,
  nativeHtmlHostFacts,
  nativeOwnerDocument,
  nativeParentElement,
  nativeRemoveAttribute,
  nativeRemoveElement,
  nativeReplaceChildren,
  nativeSetAttribute,
} from "./html_host.js";
import type { KeyboardTranslationPolicy } from "./keyboard.js";
import {
  BreditorSessionCheckpointAutosave,
  type SessionCheckpointAutosaveFlushResult,
  type SessionCheckpointAutosaveOptions,
  type SessionCheckpointAutosaveStatus,
} from "./session_checkpoint_autosave.js";
import {
  BreditorToolbar,
  isSafeToolbarHost,
  toolbarCommandDispatchResult,
  toolbarCommandRequest,
  type ToolbarCommandDispatchResult,
  type ToolbarCommandInvocation,
} from "./toolbar.js";
import {
  DEFAULT_TOOLBAR_MANIFEST,
  type ToolbarManifest,
} from "./toolbar_manifest.js";
import { toolbarManifestMatchesProfileDescriptor } from "./toolbar_profile_contract.js";
import type { BrowserActionStateSnapshot } from "./wasm_action_state_adapter.js";
import type { BrowserProjectionPlainTextResult } from "./projection_plain_text.js";
import {
  BreditorWasmCommandAdapter,
  contentReadPortsForAdapter,
  type WasmContentReadPorts,
  type WasmCommandSequenceOutcome,
} from "./wasm_command_adapter.js";
import {
  BREDITOR_BASE_SCHEMA_FINGERPRINT,
  bootstrapWasmEngine,
  preflightWasmSemanticProfile,
  type WasmBootstrappedEngineView,
  type WasmCompiledProfileBootstrapFactoryView,
  type WasmEngineBootstrapModuleView,
} from "./wasm_engine_bootstrap.js";
import type { BrowserDocumentJsonReadResult } from "./wasm_document_json.js";
import type {
  BrowserCompiledProfileDescriptor,
  WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

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

/** Generated engine factory carried by the initialized official module. */
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
  /** Required only when `semanticProfile` is supplied. */
  readonly BreditorCompiledProfile?: WasmCompiledProfileBootstrapFactoryView;
  breditorWasmAbiVersion(): string;
  breditorVersion(): string;
}

/** Strict compiled-profile bootstrap selected before any document is decoded. */
export type BreditorBrowserSemanticProfileOptions =
  | Readonly<{ bootstrapJson: string }>
  | Readonly<{ bootstrapJson: string; formatVersion: 2 }>;

/** Stable choice of the IndexedDB key used by one editor profile. */
export type BreditorBrowserEditorPersistenceScope =
  | Readonly<{ kind: "schemaFingerprint" }>
  | Readonly<{ kind: "slot"; name: string }>;

/** Atomic profile-bound persistence configuration. */
export interface BreditorBrowserEditorPersistenceOptions {
  readonly indexedDB: IDBFactory;
  readonly crypto: Pick<SubtleCrypto, "digest">;
  /** Progress callback for a blocked IndexedDB open; failures are contained. */
  readonly onBlocked?: () => void;
  /** Defaults to legacy `current` for V1 and the schema fingerprint for V2. */
  readonly scope?: BreditorBrowserEditorPersistenceScope;
  readonly autosave?: SessionCheckpointAutosaveOptions;
}

/** Complete construction policy for one framework-neutral browser editor. */
export interface BreditorBrowserEditorOptions {
  /**
   * Connected, initially empty HTML `article`, `aside`, `div`, `footer`,
   * `header`, `main`, `nav`, or `section` used as the dedicated light-DOM host.
   */
  readonly host: HTMLElement;
  /** Accessible name installed as `aria-label` on the editing host. */
  readonly label: string;
  /**
   * Initialized, exactly version-paired official Wasm module namespace.
   */
  readonly wasm: BreditorBrowserWasmModule;
  /** Used only when persistence is disabled or its exact slot is empty. */
  readonly initialDocument: BreditorBrowserInitialDocument;
  /** Optional custom semantic profile; V2 bootstrap selects durable Session V3. */
  readonly semanticProfile?: BreditorBrowserSemanticProfileOptions;
  /** Exact callback-free render coverage for the selected semantic profile. */
  readonly rendering?: InlineFormatRenderManifest;
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

/** Why a supported high-level semantic-intent request did not run. */
export type BreditorBrowserIntentRejectionReason =
  | "invalidIntent"
  | "unknownIntent"
  | "inputRequired"
  | "inputNotAccepted"
  | "invalidInput"
  | "busy"
  | "unavailable";

/**
 * Synchronous, provenance-redacted result of one high-level semantic intent.
 *
 * Concrete binding/action identities and routing fallthroughs remain confined
 * to the advanced adapter boundary. Every branch carries the authoritative
 * document snapshot observed when the public call settled.
 */
export type BreditorBrowserIntentResult =
  | Readonly<{
      status: "committed";
      intentId: string;
      document: BreditorBrowserDocumentSnapshot;
    }>
  | Readonly<{
      status: "blocked";
      intentId: string;
      reasonCode: string;
      activation: "stateless" | "inactive" | "active" | "mixed";
      document: BreditorBrowserDocumentSnapshot;
    }>
  | Readonly<{
      status: "unhandled";
      intentId: string;
      document: BreditorBrowserDocumentSnapshot;
    }>
  | Readonly<{
      status: "rejected";
      intentId: string;
      reason: BreditorBrowserIntentRejectionReason;
      document: BreditorBrowserDocumentSnapshot;
    }>
  | Readonly<{
      status: "failed";
      intentId: string;
      document: BreditorBrowserDocumentSnapshot;
    }>;

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
    | "browser_editor.presentation_invalid"
    | "browser_editor.toolbar_profile_invalid"
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
      message: string;
    }>
  | Readonly<{
      kind: "lifecycle";
      code: "content_export.busy";
      message: string;
    }>
  | Readonly<{
      kind: "lifecycle";
      code: "content_export.unavailable";
      message: string;
    }>
  | Readonly<{
      kind: "boundary";
      code: "content_export.invalid_wasm_view";
      message: string;
    }>
  | Readonly<{
      kind: "boundary";
      code: "content_export.invalid_projection";
      message: string;
    }>
  | Readonly<{
      kind: "core";
      code: "content_export.core_rejected";
      message: string;
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

interface AbortSignalIntrinsics {
  readonly aborted: (this: AbortSignal) => boolean;
  readonly add: typeof EventTarget.prototype.addEventListener;
  readonly remove: typeof EventTarget.prototype.removeEventListener;
}

interface NormalizedOptions {
  readonly host: HTMLElement;
  readonly label: string;
  readonly wasm: WasmEngineBootstrapModuleView;
  readonly initialDocument: BreditorBrowserInitialDocument;
  readonly semanticProfile: BreditorBrowserSemanticProfileOptions | undefined;
  readonly rendering: InlineFormatRenderManifest;
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
  readonly installedHostAttributes: readonly HostAttributeSnapshot[];
  readonly installedHostChildren: readonly HTMLElement[];
  readonly engine: WasmBootstrappedEngineView;
  readonly adapter: BreditorWasmCommandAdapter;
  readonly profileDescriptor: BrowserCompiledProfileDescriptor;
  readonly contentReadPorts: Readonly<WasmContentReadPorts>;
  readonly selectionBridge: BreditorDomSelectionBridge;
  readonly actionStore: BreditorActionStateStore;
  readonly queue: BreditorCommandQueue<WasmCommandSequenceOutcome>;
  readonly queueLeasePort: CommandQueueLeasePort<WasmCommandSequenceOutcome>;
  readonly storage: IndexedDbSessionCheckpointStore | undefined;
  readonly autosave:
    | BreditorSessionCheckpointAutosave<IndexedDbSessionCheckpointCasToken>
    | undefined;
}

type ImmediateQueueDelivery =
  | Readonly<{
      status: "completed";
      submission: Extract<
        CommandQueueLeasedSubmission<WasmCommandSequenceOutcome>,
        Readonly<{ status: "completed" }>
      >;
    }>
  | Readonly<{ status: "busy" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "failed" }>;

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
const INVALID_CONTENT_FORMAT: BreditorBrowserContentExportError = Object.freeze(
  {
    kind: "request",
    code: "content_export.invalid_format",
    message: "The requested content export format is invalid.",
  },
);
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
const TOOLBAR_VALIDATE_CANONICAL_DOM =
  BreditorToolbar.prototype.validateCanonicalDom;
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
  readonly #installedHostAttributes: readonly HostAttributeSnapshot[];
  readonly #installedHostChildren: readonly HTMLElement[];
  readonly #engine: WasmBootstrappedEngineView;
  readonly #adapter: BreditorWasmCommandAdapter;
  readonly #profileDescriptor: BrowserCompiledProfileDescriptor;
  readonly #readDocumentJson: BreditorWasmCommandAdapter["documentJsonReadPort"]["read"];
  readonly #readPlainText: BreditorWasmCommandAdapter["plainTextReadPort"]["read"];
  readonly #selectionBridge: BreditorDomSelectionBridge;
  readonly #actionStore: BreditorActionStateStore;
  readonly #queue: BreditorCommandQueue<WasmCommandSequenceOutcome>;
  readonly #queueLeasePort: CommandQueueLeasePort<WasmCommandSequenceOutcome>;
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
  #startupRollback = false;
  #preserveHostDomOnDisposal = false;
  #terminalSubscribers: readonly SubscriberSlot[] = Object.freeze([]);

  private constructor(token: object, resources: RuntimeResources) {
    if (token !== BROWSER_EDITOR_CONSTRUCTION) {
      throw new TypeError(
        "BreditorBrowserEditor must be opened through its factory",
      );
    }
    this.#host = resources.host;
    this.#hostAttributes = resources.hostAttributes;
    this.#installedHostAttributes = resources.installedHostAttributes;
    this.#installedHostChildren = resources.installedHostChildren;
    this.#engine = resources.engine;
    this.#adapter = resources.adapter;
    this.#profileDescriptor = resources.profileDescriptor;
    this.#readDocumentJson = resources.contentReadPorts.documentJson.read;
    this.#readPlainText = resources.contentReadPorts.plainText.read;
    this.#selectionBridge = resources.selectionBridge;
    this.#actionStore = resources.actionStore;
    this.#queue = resources.queue;
    this.#queueLeasePort = resources.queueLeasePort;
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
    let installedHostAttributes: readonly HostAttributeSnapshot[] | undefined;
    let installedHostChildren: readonly HTMLElement[] | undefined;
    let storage: IndexedDbSessionCheckpointStore | undefined;
    let engine: WasmBootstrappedEngineView | undefined;
    let profileGeneration: WasmProfileGenerationView | undefined;
    let observation:
      ReturnType<WasmBootstrappedEngineView["observation"]> | undefined;
    let renderer: BreditorDomRenderer | undefined;
    let presentation: BrowserCompiledPresentation | undefined;
    let rendered: RenderedProjection | undefined;
    let selectionBridge: BreditorDomSelectionBridge | undefined;
    let adapter: BreditorWasmCommandAdapter | undefined;
    let actionStore: BreditorActionStateStore | undefined;
    let queue: BreditorCommandQueue<WasmCommandSequenceOutcome> | undefined;
    let queueLeasePort:
      | CommandQueueLeasePort<WasmCommandSequenceOutcome>
      | undefined;
    let autosave:
      | BreditorSessionCheckpointAutosave<IndexedDbSessionCheckpointCasToken>
      | undefined;
    let editor: BreditorBrowserEditor | undefined;
    let preflightProfileDescriptor:
      | BrowserCompiledProfileDescriptor
      | undefined;
    let transferred = false;

    try {
      if (normalized.signal?.isAborted() === true) {
        return openFailure("browser_editor.aborted");
      }

      let loaded: IndexedDbSessionCheckpointLoadResult | undefined;
      if (normalized.persistence !== undefined) {
        if (normalized.semanticProfile !== undefined) {
          const preflight = preflightWasmSemanticProfile(
            normalized.wasm,
            normalized.semanticProfile,
          );
          if (!preflight.ok) {
            return openFailure(
              "browser_editor.engine_bootstrap_failed",
              preflight.error.code,
            );
          }
          preflightProfileDescriptor = preflight.profileDescriptor;
        }
        const binding = persistenceBinding(
          normalized.persistence.scope,
          preflightProfileDescriptor,
          normalized.semanticProfile,
        );
        storage = new IndexedDbSessionCheckpointStore({
          indexedDB: normalized.persistence.indexedDB,
          crypto: normalized.persistence.crypto,
          ...(normalized.persistence.onBlocked === undefined
            ? {}
            : { onBlocked: normalized.persistence.onBlocked }),
          ...(binding === undefined ? {} : { binding }),
        });
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
        !usableEmptyEditorHost(normalized.host) ||
        (normalized.toolbar !== undefined &&
          !usableEmptyToolbarHost(normalized.toolbar.host))
      ) {
        return openFailure("browser_editor.setup_failed");
      }

      const bootstrap = bootstrapWasmEngine(
        normalized.wasm,
        loaded?.ok === true && loaded.status === "loaded"
          ? Object.freeze({
              kind: "sessionCheckpoint" as const,
              checkpointJson: loaded.checkpointJson,
              ...(normalized.semanticProfile === undefined
                ? {}
                : { semanticProfile: normalized.semanticProfile }),
            })
          : Object.freeze({
              kind: "document" as const,
              lineageId: normalized.initialDocument.lineageId,
              documentJson: normalized.initialDocument.documentJson,
              historyCapacity: normalized.initialDocument.historyCapacity,
              ...(normalized.semanticProfile === undefined
                ? {}
                : { semanticProfile: normalized.semanticProfile }),
            }),
      );
      if (!bootstrap.ok) {
        return openFailure(
          "browser_editor.engine_bootstrap_failed",
          bootstrap.error.code,
        );
      }
      engine = bootstrap.engine;
      profileGeneration = bootstrap.profileGeneration;
      observation = bootstrap.observation;
      if (
        preflightProfileDescriptor !== undefined &&
        (bootstrap.durableMode !== semanticProfileDurableMode(
          normalized.semanticProfile,
        ) ||
          !profileDurableBindingsEqual(
            preflightProfileDescriptor,
            bootstrap.profileDescriptor,
          ))
      ) {
        return openFailure(
          "browser_editor.engine_bootstrap_failed",
          "engine_bootstrap.profile_changed_after_preflight",
        );
      }
      if (bootstrap.durableMode !== "v1") {
        try {
          presentation = compileBrowserPresentation(
            profileGeneration,
            bootstrap.profileDescriptor,
            normalized.rendering,
          );
        } catch {
          return openFailure("browser_editor.presentation_invalid");
        }
      }
      if (
        normalized.toolbar !== undefined &&
        !toolbarManifestMatchesProfileDescriptor(
          normalized.toolbar.manifest,
          bootstrap.profileDescriptor,
        )
      ) {
        return openFailure("browser_editor.toolbar_profile_invalid");
      }

      // Generated module/profile methods can synchronously reenter application
      // code just as IndexedDB can yield to it. Never overwrite a mount changed
      // during bootstrap or presentation correlation.
      if (
        EDITOR_HOSTS.get(normalized.host) !== reservation ||
        !usableEmptyEditorHost(normalized.host) ||
        (normalized.toolbar !== undefined &&
          !usableEmptyToolbarHost(normalized.toolbar.host))
      ) {
        return openFailure("browser_editor.setup_failed");
      }

      const capturedHostAttributes = snapshotHostAttributes(normalized.host);
      if (capturedHostAttributes === null) {
        return openFailure("browser_editor.setup_failed");
      }
      hostAttributes = capturedHostAttributes;
      installedHostAttributes = expectedInstalledHostAttributes(normalized);
      if (!installHostAttributes(normalized)) {
        return openFailure("browser_editor.setup_failed");
      }
      // Customized built-in hosts can synchronously react to attribute writes.
      // Never let the renderer overwrite DOM installed by such a reaction.
      if (
        EDITOR_HOSTS.get(normalized.host) !== reservation ||
        !usableEmptyEditorHost(normalized.host) ||
        (normalized.toolbar !== undefined &&
          !usableEmptyToolbarHost(normalized.toolbar.host))
      ) {
        return openFailure("browser_editor.setup_failed");
      }

      renderer = new BreditorDomRenderer(presentation);
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
      installedHostChildren = snapshotRenderedHostChildren(rendered) ?? undefined;
      if (installedHostChildren === undefined) {
        return openFailure("browser_editor.setup_failed");
      }
      selectionBridge = new BreditorDomSelectionBridge();
      adapter = new BreditorWasmCommandAdapter(engine, observation, {
        durableMode: bootstrap.durableMode,
        profileGeneration,
        profileDescriptor: bootstrap.profileDescriptor,
        renderer,
        rendered,
        selectionBridge,
      });
      observation = undefined;
      profileGeneration = undefined;
      rendered = undefined;
      const contentReadPorts = contentReadPortsForAdapter(adapter);
      if (contentReadPorts === undefined) {
        return openFailure("browser_editor.setup_failed");
      }

      const restored = adapter.restoreCanonicalRender();
      const restoredHostChildren = snapshotRenderedHostChildren(adapter.rendered);
      if (restoredHostChildren !== null) {
        installedHostChildren = restoredHostChildren;
      }
      if (!restored.ok) {
        return openFailure(
          "browser_editor.initial_selection_failed",
          initialSelectionCauseCode(restored.reason),
        );
      }
      installedHostChildren = snapshotRenderedHostChildren(adapter.rendered) ??
        undefined;
      if (installedHostChildren === undefined) {
        return openFailure("browser_editor.setup_failed");
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

      // Action-state generation is the last startup step allowed to invoke
      // Wasm-facing getters. Re-prove both reserved mounts and the exact
      // canonical render before any live owner can escape.
      if (
        !startupRenderIsCanonical(
          normalized,
          reservation,
          renderer,
          adapter,
          true,
        )
      ) {
        return openFailure("browser_editor.setup_failed");
      }

      const commandExecutor = adapter.commandExecutor;
      queue = new BreditorCommandQueue(commandExecutor, {
        // A completed delivery must make action state revision-coherent before
        // submit() returns. The core-commit microtask below remains the fallback
        // for a commit which publishes before a later adapter/render failure.
        observer: actionStore.queueObserver,
      });
      queueLeasePort = openCommandQueueLeasePort(queue, commandExecutor);
      if (queueLeasePort === undefined) {
        return openFailure("browser_editor.setup_failed");
      }
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
        installedHostAttributes,
        installedHostChildren,
        engine,
        adapter,
        profileDescriptor: bootstrap.profileDescriptor,
        contentReadPorts,
        selectionBridge,
        actionStore,
        queue,
        queueLeasePort,
        storage,
        autosave,
      });
      if (
        !startupRenderIsCanonical(
          normalized,
          reservation,
          renderer,
          adapter,
          true,
        )
      ) {
        return openFailure("browser_editor.setup_failed");
      }
      EDITOR_HOSTS.set(normalized.host, editor.#ownership);
      editor.#installCoreObservers();
      if (normalized.toolbar !== undefined) {
        if (
          !startupRenderIsCanonical(
            normalized,
            editor.#ownership,
            renderer,
            adapter,
            true,
          )
        ) {
          return openFailure("browser_editor.setup_failed");
        }
        editor.#installToolbar(
          normalized.toolbar.host,
          normalized.toolbar.manifest,
        );
      }
      editor.#installRouter(normalized.keyboard, normalized.scheduleTask);
      if (normalized.signal?.isAborted() === true) {
        return openFailure("browser_editor.aborted");
      }
      if (
        !startupRenderIsCanonical(
          normalized,
          editor.#ownership,
          renderer,
          adapter,
          false,
          editor.#toolbar,
        )
      ) {
        return openFailure("browser_editor.setup_failed");
      }

      transferred = true;
      return Object.freeze({ ok: true, editor });
    } catch {
      return openFailure("browser_editor.setup_failed");
    } finally {
      if (!transferred) {
        if (editor !== undefined) {
          editor.#disposeForStartupRollback();
        } else {
          // Remove only the exact projection nodes installed by this startup,
          // before generated `free()` callbacks can add application content.
          removeInstalledHostChildren(
            normalized.host,
            installedHostChildren ?? Object.freeze([]),
          );
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
          if (profileGeneration !== undefined) bestEffortFree(profileGeneration);
          if (engine !== undefined) bestEffortFree(engine);
          bestEffortIntrinsic(storage, STORAGE_CLOSE);
          if (hostAttributes !== undefined) {
            if (installedHostAttributes === undefined) {
              restoreHostAttributes(normalized.host, hostAttributes);
            } else {
              restoreHostAttributesIfUnchanged(
                normalized.host,
                hostAttributes,
                installedHostAttributes,
              );
            }
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
   * Executes one declared no-input semantic intent against the current core
   * selection without consulting mutable DOM selection.
   *
   * Delivery is immediate-or-rejected: calls made during composition, another
   * delivery, or an authoritative read never wait behind work whose token may
   * become stale.
   */
  executeIntent(intentId: string): BreditorBrowserIntentResult {
    const reportedIntentId = validBrowserIntentId(intentId) ? intentId : "";
    if (!validBrowserIntentId(intentId)) {
      return this.#intentRejected(reportedIntentId, "invalidIntent");
    }
    const descriptor = findProfileIntent(this.#profileDescriptor, intentId);
    if (descriptor === undefined) {
      return this.#intentRejected(intentId, "unknownIntent");
    }
    if (descriptor.input.kind !== "none") {
      return this.#intentRejected(intentId, "inputRequired");
    }
    if (this.#status.phase !== "live") {
      return this.#intentRejected(intentId, "unavailable");
    }

    const delivery = this.#submitImmediate(() =>
      noInputIntentRequest(
        this.#adapter.deliveryToken(),
        preserveSelectionSync(),
        Object.freeze({ kind: "api" as const, detail: intentId }),
        intentId,
        "closeBefore",
      ),
    );
    if (delivery.status === "busy" || delivery.status === "unavailable") {
      return this.#intentRejected(intentId, delivery.status);
    }
    if (delivery.status === "failed") {
      this.#fault("queueUncertain");
      return this.#intentFailed(intentId);
    }

    try {
      const sequence = delivery.submission.result;
      if (sequence.status !== "delivered") {
        throw new TypeError("intent delivery outcome is invalid");
      }
      const outcome = sequence.command;
      const document = this.#correlatedIntentDocument(outcome.snapshot);
      if (document === undefined || outcome.status === "disabled" ||
        outcome.status === "unchanged") {
        throw new TypeError("intent command outcome is invalid");
      }
      if (
        outcome.status === "committed" &&
        outcome.eventKind === "intent" &&
        outcome.intentId === intentId
      ) {
        return Object.freeze({ status: "committed", intentId, document });
      }
      if (
        outcome.status === "blocked" &&
        outcome.intentId === intentId &&
        validBrowserIntentReasonCode(outcome.reasonCode) &&
        validBrowserIntentActivation(outcome.activation)
      ) {
        return Object.freeze({
          status: "blocked",
          intentId,
          reasonCode: outcome.reasonCode,
          activation: outcome.activation,
          document,
        });
      }
      if (outcome.status === "unhandled" && outcome.intentId === intentId) {
        return Object.freeze({ status: "unhandled", intentId, document });
      }
    } catch {
      // The single uncertainty transition below owns every impossible shape.
    }
    this.#fault("queueUncertain");
    return this.#intentFailed(intentId);
  }

  /**
   * Executes one declared typed semantic intent from its exact JSON transport.
   *
   * The Rust profile supplies the value-contract identity; callers cannot
   * forge it. JSON is kept byte-for-byte so duplicate keys and other
   * non-deterministic forms remain visible to the strict Wasm decoder.
   */
  executeIntentJson(
    intentId: string,
    inputJson: string,
  ): BreditorBrowserIntentResult {
    const reportedIntentId = validBrowserIntentId(intentId) ? intentId : "";
    if (!validBrowserIntentId(intentId)) {
      return this.#intentRejected(reportedIntentId, "invalidIntent");
    }
    if (!browserCommandJsonIsAdmissible(inputJson)) {
      return this.#intentRejected(intentId, "invalidInput");
    }
    const descriptor = findProfileIntent(this.#profileDescriptor, intentId);
    if (descriptor === undefined) {
      return this.#intentRejected(intentId, "unknownIntent");
    }
    if (descriptor.input.kind !== "typed") {
      return this.#intentRejected(intentId, "inputNotAccepted");
    }
    if (this.#status.phase !== "live") {
      return this.#intentRejected(intentId, "unavailable");
    }

    const delivery = this.#submitImmediate(() =>
      jsonIntentRequest(
        this.#adapter.deliveryToken(),
        preserveSelectionSync(),
        Object.freeze({ kind: "api" as const, detail: intentId }),
        intentId,
        inputJson,
        "closeBefore",
      ),
    );
    if (delivery.status === "busy" || delivery.status === "unavailable") {
      return this.#intentRejected(intentId, delivery.status);
    }
    if (delivery.status === "failed") {
      this.#fault("queueUncertain");
      return this.#intentFailed(intentId);
    }

    try {
      const sequence = delivery.submission.result;
      if (sequence.status !== "delivered") {
        throw new TypeError("intent delivery outcome is invalid");
      }
      const outcome = sequence.command;
      const document = this.#correlatedIntentDocument(outcome.snapshot);
      if (document !== undefined && outcome.status === "rejected") {
        return Object.freeze({
          status: "rejected",
          intentId,
          reason: "invalidInput",
          document,
        });
      }
      if (
        document === undefined ||
        outcome.status === "disabled" ||
        outcome.status === "unchanged"
      ) {
        throw new TypeError("intent command outcome is invalid");
      }
      if (
        outcome.status === "committed" &&
        outcome.eventKind === "intent" &&
        outcome.intentId === intentId
      ) {
        return Object.freeze({ status: "committed", intentId, document });
      }
      if (
        outcome.status === "blocked" &&
        outcome.intentId === intentId &&
        validBrowserIntentReasonCode(outcome.reasonCode) &&
        validBrowserIntentActivation(outcome.activation)
      ) {
        return Object.freeze({
          status: "blocked",
          intentId,
          reasonCode: outcome.reasonCode,
          activation: outcome.activation,
          document,
        });
      }
      if (outcome.status === "unhandled" && outcome.intentId === intentId) {
        return Object.freeze({ status: "unhandled", intentId, document });
      }
    } catch {
      // The single uncertainty transition below owns every impossible shape.
    }
    this.#fault("queueUncertain");
    return this.#intentFailed(intentId);
  }

  /**
   * Copies authoritative content without exposing engine state or Wasm handles.
   *
   * `documentJson` is the lossless canonical Document V1 or profile-bound V2
   * record selected at bootstrap. `plainText` joins semantic paragraphs with
   * LF and strips formatting; it never reads mutable DOM text. Busy
   * composition/delivery/read leases fail benignly.
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
      ? contentExportFromDocumentJson(
          result as BrowserDocumentJsonReadResult,
          before,
          after,
        )
      : contentExportFromPlainText(
          result as BrowserProjectionPlainTextResult,
          before,
          after,
        );
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
      nativeFocusHtmlElement(this.#host);
      const ownerDocument = nativeOwnerDocument(this.#host);
      const focused =
        ownerDocument !== null &&
        nativeDocumentActiveElement(ownerDocument) === this.#host;
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

  #disposeForStartupRollback(): void {
    this.#startupRollback = true;
    // Remove exact installed nodes before any generated cleanup callback can
    // add foreign content. Everything added from this point onward survives.
    removeInstalledHostChildren(this.#host, this.#installedHostChildren);
    this.#preserveHostDomOnDisposal = true;
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
    if (!this.#preserveHostDomOnDisposal) {
      clearOwnedHost(this.#host);
    }
    if (this.#startupRollback) {
      restoreHostAttributesIfUnchanged(
        this.#host,
        this.#hostAttributes,
        this.#installedHostAttributes,
      );
    } else {
      restoreHostAttributes(this.#host, this.#hostAttributes);
    }
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

  #submitImmediate(
    buildRequest: () => Parameters<
      CommandQueueLeasePort<WasmCommandSequenceOutcome>["submitLeased"]
    >[1],
  ): ImmediateQueueDelivery {
    if (this.#status.phase !== "live") {
      return Object.freeze({ status: "unavailable" });
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
        return Object.freeze({ status: "busy" });
      }
      if (adapterState !== "live") {
        return Object.freeze({ status: "unavailable" });
      }
      if (this.#queueLeasePort.failure() !== undefined) {
        return Object.freeze({ status: "failed" });
      }
    } catch {
      return Object.freeze({ status: "failed" });
    }

    let lease: ReturnType<
      CommandQueueLeasePort<WasmCommandSequenceOutcome>["acquireLease"]
    >;
    try {
      lease = this.#queueLeasePort.acquireLease();
    } catch {
      return Object.freeze({ status: "failed" });
    }
    if (lease === undefined) {
      try {
        return this.#queueLeasePort.failure() === undefined
          ? Object.freeze({ status: "busy" })
          : Object.freeze({ status: "failed" });
      } catch {
        return Object.freeze({ status: "failed" });
      }
    }

    let submission:
      | CommandQueueLeasedSubmission<WasmCommandSequenceOutcome>
      | undefined;
    let released = false;
    try {
      const request = buildRequest();
      submission = this.#queueLeasePort.submitLeased(lease, request);
    } catch {
      submission = undefined;
    } finally {
      try {
        released = this.#queueLeasePort.releaseLease(lease);
      } catch {
        released = false;
      }
    }

    // Once the queue has returned an exact completion or uncertainty result,
    // a lifecycle transition triggered reentrantly during that delivery must
    // not rewrite what happened. In particular, disposal can invalidate the
    // lease before this finally block releases it even though the command has
    // already committed. `unavailable` is reserved for paths with no admitted
    // outcome, never for a completed or failed submission.
    if (submission?.status === "completed") {
      if (!released && this.#status.phase === "live") {
        return Object.freeze({ status: "failed" });
      }
      return Object.freeze({ status: "completed", submission });
    }
    if (submission?.status === "failed") {
      return Object.freeze({ status: "failed" });
    }
    if (
      submission?.status === "rejected" &&
      submission.reason === "disposed"
    ) {
      return Object.freeze({ status: "unavailable" });
    }
    if (submission === undefined && this.#status.phase !== "live") {
      return Object.freeze({ status: "unavailable" });
    }
    return Object.freeze({ status: "failed" });
  }

  #intentRejected(
    intentId: string,
    reason: BreditorBrowserIntentRejectionReason,
  ): BreditorBrowserIntentResult {
    return Object.freeze({
      status: "rejected",
      intentId,
      reason,
      document: this.#currentIntentDocument(),
    });
  }

  #intentFailed(intentId: string): BreditorBrowserIntentResult {
    return Object.freeze({
      status: "failed",
      intentId,
      document: this.#currentIntentDocument(),
    });
  }

  #currentIntentDocument(): BreditorBrowserDocumentSnapshot {
    try {
      const snapshot = this.#adapter.snapshot;
      if (validBrowserDocumentSnapshot(snapshot)) {
        return Object.freeze({
          lineage: snapshot.lineage,
          revision: snapshot.revision,
        });
      }
    } catch {
      // The immutable last-published snapshot remains the redacted fallback.
    }
    const fallback = this.#snapshot.document;
    return Object.freeze({
      lineage: fallback.lineage,
      revision: fallback.revision,
    });
  }

  #correlatedIntentDocument(
    candidate: unknown,
  ): BreditorBrowserDocumentSnapshot | undefined {
    if (!validBrowserDocumentSnapshot(candidate)) return undefined;
    const current = this.#currentIntentDocument();
    return snapshotsMatch(candidate, current) ? current : undefined;
  }

  #dispatchToolbar(
    invocation: ToolbarCommandInvocation,
  ): ToolbarCommandDispatchResult {
    if (this.#status.phase !== "live") {
      return toolbarCommandDispatchResult("rejected");
    }
    const delivery = this.#submitImmediate(() =>
      toolbarCommandRequest(this.#adapter.deliveryToken(), invocation),
    );
    if (delivery.status === "busy" || delivery.status === "unavailable") {
      return toolbarCommandDispatchResult("rejected");
    }
    if (
      delivery.status === "completed" &&
      toolbarSequenceOutcomeMatchesInvocation(
        delivery.submission.result,
        invocation,
      )
    ) {
      return toolbarCommandDispatchResult("completed");
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

function validBrowserDocumentSnapshot(
  value: unknown,
): value is BreditorBrowserDocumentSnapshot {
  if (!objectLike(value)) return false;
  try {
    const snapshot = value as Partial<BreditorBrowserDocumentSnapshot>;
    return typeof snapshot.lineage === "string" &&
      snapshot.lineage.length >= 1 &&
      typeof snapshot.revision === "string" &&
      /^(0|[1-9][0-9]*)$/u.test(snapshot.revision);
  } catch {
    return false;
  }
}

function validBrowserIntentId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value);
}

function validBrowserIntentReasonCode(value: unknown): value is string {
  return validBrowserIntentId(value);
}

function validBrowserIntentActivation(
  value: unknown,
): value is "stateless" | "inactive" | "active" | "mixed" {
  return value === "stateless" || value === "inactive" ||
    value === "active" || value === "mixed";
}

function findProfileIntent(
  descriptor: BrowserCompiledProfileDescriptor,
  intentId: string,
): BrowserCompiledProfileDescriptor["intents"][number] | undefined {
  for (let index = 0; index < descriptor.intents.length; index += 1) {
    const intent = descriptor.intents[index];
    if (intent?.id === intentId) return intent;
  }
  return undefined;
}

function toolbarSequenceOutcomeMatchesInvocation(
  sequence: WasmCommandSequenceOutcome,
  invocation: ToolbarCommandInvocation,
): boolean {
  try {
    if (sequence.status !== "delivered") return false;
    const outcome = sequence.command;
    const command = invocation.command;
    if (outcome.status === "rejected") {
      return command.kind === "action" || command.kind === "intent";
    }
    if (command.kind === "intent") {
      return outcome.status === "committed"
        ? outcome.eventKind === "intent" && outcome.intentId === command.intentId
        : (outcome.status === "blocked" || outcome.status === "unhandled") &&
            outcome.intentId === command.intentId;
    }
    if (command.kind === "history") {
      return outcome.status === "unchanged" ||
        (outcome.status === "committed" &&
          outcome.eventKind === command.operation);
    }
    return outcome.status === "disabled"
      ? outcome.actionId === command.actionId
      : outcome.status === "committed" && outcome.eventKind === "action";
  } catch {
    return false;
  }
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

/** Copies the profile selector from one immutable own-data snapshot. */
function snapshotSemanticProfileOptions(
  value: unknown,
): BreditorBrowserSemanticProfileOptions | null {
  try {
    if (!objectLike(value)) return null;
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== "string") ||
      (keys.length !== 1 && keys.length !== 2) ||
      !keys.includes("bootstrapJson") ||
      (keys.length === 2 && !keys.includes("formatVersion"))
    ) {
      return null;
    }
    const bootstrap = Reflect.getOwnPropertyDescriptor(value, "bootstrapJson");
    if (
      bootstrap === undefined ||
      !("value" in bootstrap) ||
      typeof bootstrap.value !== "string"
    ) {
      return null;
    }
    if (keys.length === 1) {
      return Object.freeze({ bootstrapJson: bootstrap.value });
    }
    const formatVersion = Reflect.getOwnPropertyDescriptor(value, "formatVersion");
    if (
      formatVersion === undefined ||
      !("value" in formatVersion) ||
      formatVersion.value !== 2
    ) {
      return null;
    }
    return Object.freeze({
      bootstrapJson: bootstrap.value,
      formatVersion: 2 as const,
    });
  } catch {
    return null;
  }
}

function normalizeOptions(value: unknown): NormalizedOptions | null {
  try {
    if (!objectLike(value)) return null;
    const options = value as unknown as BreditorBrowserEditorOptions;
    const host = options.host;
    const label = options.label;
    const wasm = options.wasm;
    const initial = options.initialDocument;
    const semanticProfile = options.semanticProfile;
    const normalizedSemanticProfile = semanticProfile === undefined
      ? undefined
      : snapshotSemanticProfileOptions(semanticProfile);
    if (normalizedSemanticProfile === null) return null;
    const rendering = options.rendering;
    const keyboard = options.keyboard;
    const toolbar = options.toolbar;
    const persistence = options.persistence;
    const scheduleTask = options.scheduleTask;
    const signal = options.signal;
    const spellcheck = options.spellcheck ?? true;
    if (
      !usableEmptyEditorHost(host) ||
      typeof label !== "string" ||
      label.length < 1 ||
      label.length > MAX_BROWSER_EDITOR_LABEL_UTF16 ||
      label.trim().length < 1 ||
      !wellFormedUtf16(label) ||
      !objectLike(wasm) ||
      !objectLike(initial) ||
      (rendering !== undefined && semanticProfile === undefined) ||
      (rendering !== undefined && !isOwnedInlineFormatRenderManifest(rendering)) ||
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
        !usableEmptyToolbarHost(toolbar.host)
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
      const scope = normalizePersistenceScope(persistence.scope);
      if (scope === null) return null;
      normalizedPersistence = Object.freeze({
        indexedDB: persistence.indexedDB,
        crypto: persistence.crypto,
        ...(persistence.onBlocked === undefined
          ? {}
          : { onBlocked: persistence.onBlocked }),
        ...(persistence.autosave === undefined
          ? {}
          : { autosave: persistence.autosave }),
        ...(scope === undefined ? {} : { scope }),
      });
    }
    const normalizedSignal = normalizeAbortSignal(signal);
    if (signal !== undefined && normalizedSignal === null) return null;
    return Object.freeze({
      host,
      label,
      // The public high-level shape deliberately returns `unknown`; the
      // bootstrap below performs the complete generated-view validation.
      wasm: wasm as unknown as WasmEngineBootstrapModuleView,
      initialDocument,
      semanticProfile: normalizedSemanticProfile,
      rendering: rendering ?? DEFAULT_INLINE_FORMAT_RENDER_MANIFEST,
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

function normalizePersistenceScope(
  value: unknown,
): BreditorBrowserEditorPersistenceScope | null | undefined {
  if (value === undefined) return undefined;
  if (!objectLike(value)) return null;
  const scope = value as Partial<BreditorBrowserEditorPersistenceScope> & {
    readonly name?: unknown;
  };
  if (scope.kind === "schemaFingerprint") {
    return Object.freeze({ kind: "schemaFingerprint" });
  }
  if (
    scope.kind === "slot" &&
    typeof scope.name === "string" &&
    scope.name.length <= MAX_SESSION_CHECKPOINT_SLOT_ASCII_BYTES &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(scope.name)
  ) {
    return Object.freeze({ kind: "slot", name: scope.name });
  }
  return null;
}

function persistenceBinding(
  scope: BreditorBrowserEditorPersistenceScope | undefined,
  profileDescriptor: BrowserCompiledProfileDescriptor | undefined,
  semanticProfile: BreditorBrowserSemanticProfileOptions | undefined,
): IndexedDbSessionCheckpointBinding | undefined {
  if (scope === undefined && profileDescriptor === undefined) return undefined;
  const schemaFingerprint = profileDescriptor?.schema.fingerprint ??
    BREDITOR_BASE_SCHEMA_FINGERPRINT;
  const slot = scope?.kind === "slot" ? scope.name : schemaFingerprint;
  return Object.freeze({
    slot,
    schemaFingerprint,
    checkpointFormatVersion: profileDescriptor === undefined
      ? 1
      : semanticProfileDurableMode(semanticProfile) === "v3" ? 3 : 2,
  });
}

function profileDurableBindingsEqual(
  left: BrowserCompiledProfileDescriptor,
  right: BrowserCompiledProfileDescriptor,
): boolean {
  return left.schema.name === right.schema.name &&
    left.schema.version === right.schema.version &&
    left.schema.fingerprint === right.schema.fingerprint &&
    left.formats.length === right.formats.length &&
    left.formats.every((format, index) => {
      const other = right.formats[index];
      return other !== undefined &&
        format.kind === other.kind &&
        format.revision === other.revision &&
        format.properties.length === other.properties.length &&
        format.properties.every((property, propertyIndex) => {
          const otherProperty = other.properties[propertyIndex];
          return otherProperty !== undefined &&
            property.name === otherProperty.name &&
            property.presence === otherProperty.presence &&
            formatPropertyTypesEqual(property.valueType, otherProperty.valueType);
        });
    });
}

function semanticProfileDurableMode(
  profile: BreditorBrowserSemanticProfileOptions | undefined,
): "v2" | "v3" {
  return profile !== undefined && "formatVersion" in profile ? "v3" : "v2";
}

function formatPropertyTypesEqual(
  left: BrowserCompiledProfileDescriptor["formats"][number]["properties"][number]["valueType"],
  right: BrowserCompiledProfileDescriptor["formats"][number]["properties"][number]["valueType"],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "boolean") return right.kind === "boolean";
  if (left.kind === "integer") {
    return right.kind === "integer" &&
      left.minimum === right.minimum &&
      left.maximum === right.maximum;
  }
  return right.kind === "string" &&
    left.minimumUtf8Bytes === right.minimumUtf8Bytes &&
    left.maximumUtf8Bytes === right.maximumUtf8Bytes;
}

function normalizeAbortSignal(
  value: unknown,
): NormalizedAbortSignal | null | undefined {
  if (value === undefined) return undefined;
  if (!objectLike(value)) return null;
  try {
    const intrinsics = readAbortSignalIntrinsics();
    if (intrinsics === null) return null;
    const signal = value as unknown as AbortSignal;
    const initial = Reflect.apply(intrinsics.aborted, signal, []) as unknown;
    if (typeof initial !== "boolean") return null;
    return Object.freeze({
      isAborted: () => {
        try {
          return Reflect.apply(intrinsics.aborted, signal, []) === true;
        } catch {
          return true;
        }
      },
      add: (listener: () => void) => {
        Reflect.apply(intrinsics.add, signal, ["abort", listener, { once: true }]);
      },
      remove: (listener: () => void) => {
        Reflect.apply(intrinsics.remove, signal, ["abort", listener]);
      },
    });
  } catch {
    return null;
  }
}

function readAbortSignalIntrinsics(): AbortSignalIntrinsics | null {
  try {
    // Browser globals may be installed after module evaluation by a test or
    // embedding environment, so resolve the current realm only at admission.
    const signalPrototype =
      typeof AbortSignal === "function" ? AbortSignal.prototype : undefined;
    const aborted = signalPrototype === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(signalPrototype, "aborted")?.get;
    // Some embeddings install AbortSignal and EventTarget from distinct DOM
    // realms. Walk from AbortSignal.prototype so the listener methods carry the
    // same implementation brand as the signal getter.
    const add = prototypeMethod(signalPrototype, "addEventListener");
    const remove = prototypeMethod(signalPrototype, "removeEventListener");
    if (
      typeof aborted !== "function" ||
      typeof add !== "function" ||
      typeof remove !== "function"
    ) {
      return null;
    }
    return Object.freeze({
      aborted: aborted as (this: AbortSignal) => boolean,
      add: add as typeof EventTarget.prototype.addEventListener,
      remove: remove as typeof EventTarget.prototype.removeEventListener,
    });
  } catch {
    return null;
  }
}

function prototypeMethod(
  prototype: object | undefined,
  name: string,
): ((this: unknown, ...args: unknown[]) => unknown) | undefined {
  let candidate: object | null | undefined = prototype;
  while (candidate !== undefined && candidate !== null) {
    const value = Object.getOwnPropertyDescriptor(candidate, name)?.value;
    if (typeof value === "function") {
      return value as (this: unknown, ...args: unknown[]) => unknown;
    }
    candidate = Object.getPrototypeOf(candidate) as object | null;
  }
  return undefined;
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
  let active = true;
  const onAbort = (): void => {
    if (!active) return;
    active = false;
    bestEffortIntrinsic(store, STORAGE_CLOSE);
    settleAbort?.(Object.freeze({ kind: "aborted" }));
  };
  try {
    signal.add(onAbort);
  } catch {
    active = false;
    try {
      signal.remove(onAbort);
    } catch {
      // Logical invalidation already makes a retained callback inert.
    }
    return Object.freeze({ kind: "aborted" });
  }
  if (signal.isAborted()) onAbort();
  try {
    return await Promise.race([load, abort]);
  } finally {
    // Invalidate first: a platform which retains the listener cannot close a
    // persistence owner after startup has transferred it to a live editor.
    active = false;
    try {
      signal.remove(onAbort);
    } catch {
      // Logical startup state does not depend on platform listener cleanup.
    }
  }
}

function usableEmptyHost(value: unknown): value is HTMLElement {
  try {
    const facts = nativeHtmlHostFacts(value);
    return facts !== undefined && facts.isConnected && !facts.hasChildren;
  } catch {
    return false;
  }
}

function usableEmptyEditorHost(value: unknown): value is HTMLElement {
  try {
    return usableEmptyHost(value) && isSafeFlowContainerHost(value);
  } catch {
    return false;
  }
}

function usableEmptyToolbarHost(value: unknown): value is HTMLElement {
  try {
    return usableEmptyHost(value) && isSafeToolbarHost(value);
  } catch {
    return false;
  }
}

function snapshotRenderedHostChildren(
  rendered: RenderedProjection,
): readonly HTMLElement[] | null {
  try {
    const elements: HTMLElement[] = [];
    for (
      let index = 0;
      index < rendered.projection.paragraphs.length;
      index += 1
    ) {
      const child = rendered.nodeForAstPath(Object.freeze([index]));
      const facts = nativeHtmlHostFacts(child);
      if (facts === undefined || facts.tagName !== "P") return null;
      elements.push(facts.element);
    }
    return Object.freeze(elements);
  } catch {
    return null;
  }
}

function removeInstalledHostChildren(
  host: HTMLElement,
  children: readonly HTMLElement[],
): void {
  for (const child of children) {
    try {
      if (nativeParentElement(child) === host) nativeRemoveElement(child);
    } catch {
      // Rollback never broadens an exact-node removal after a DOM failure.
    }
  }
}

function startupRenderIsCanonical(
  options: NormalizedOptions,
  owner: object,
  renderer: BreditorDomRenderer,
  adapter: BreditorWasmCommandAdapter,
  requireEmptyToolbar: boolean,
  toolbar?: BreditorToolbar,
): boolean {
  try {
    const facts = nativeHtmlHostFacts(options.host);
    return (
      EDITOR_HOSTS.get(options.host) === owner &&
      facts !== undefined &&
      facts.isConnected &&
      isSafeFlowContainerHost(options.host) &&
      installedHostAttributesMatch(options) &&
      renderer.owns(adapter.rendered) &&
      (requireEmptyToolbar
        ? options.toolbar === undefined ||
          usableEmptyToolbarHost(options.toolbar.host)
        : options.toolbar === undefined
          ? toolbar === undefined
          : toolbar !== undefined &&
            Reflect.apply(TOOLBAR_VALIDATE_CANONICAL_DOM, toolbar, []) === true)
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
        Object.freeze({ name, value: nativeGetAttribute(host, name) }),
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
    nativeRemoveAttribute(options.host, "inert");
    nativeSetAttribute(options.host, "contenteditable", "true");
    nativeSetAttribute(options.host, "role", "textbox");
    nativeSetAttribute(options.host, "aria-label", options.label);
    nativeSetAttribute(options.host, "aria-multiline", "true");
    nativeSetAttribute(options.host, "aria-disabled", "false");
    nativeSetAttribute(
      options.host,
      "spellcheck",
      options.spellcheck ? "true" : "false",
    );
    nativeSetAttribute(options.host, "data-breditor-editor-root", "");
    return installedHostAttributesMatch(options);
  } catch {
    return false;
  }
}

function installedHostAttributesMatch(options: NormalizedOptions): boolean {
  return (
    !nativeHasAttribute(options.host, "inert") &&
    nativeGetAttribute(options.host, "contenteditable") === "true" &&
    nativeGetAttribute(options.host, "role") === "textbox" &&
    nativeGetAttribute(options.host, "aria-label") === options.label &&
    nativeGetAttribute(options.host, "aria-multiline") === "true" &&
    nativeGetAttribute(options.host, "aria-disabled") === "false" &&
    nativeGetAttribute(options.host, "spellcheck") ===
      (options.spellcheck ? "true" : "false") &&
    nativeHasAttribute(options.host, "data-breditor-editor-root") &&
    nativeGetAttribute(options.host, "data-breditor-editor-root") === ""
  );
}

function expectedInstalledHostAttributes(
  options: NormalizedOptions,
): readonly HostAttributeSnapshot[] {
  const values: Readonly<Record<string, string | null>> = Object.freeze({
    contenteditable: "true",
    role: "textbox",
    "aria-label": options.label,
    "aria-multiline": "true",
    "aria-disabled": "false",
    spellcheck: options.spellcheck ? "true" : "false",
    inert: null,
    "data-breditor-editor-root": "",
  });
  return Object.freeze(
    EDITOR_ATTRIBUTES.map((name) =>
      Object.freeze({ name, value: values[name] ?? null }),
    ),
  );
}

function restoreHostAttributes(
  host: HTMLElement,
  attributes: readonly HostAttributeSnapshot[],
): void {
  for (const attribute of attributes) {
    try {
      if (attribute.value === null) nativeRemoveAttribute(host, attribute.name);
      else nativeSetAttribute(host, attribute.name, attribute.value);
    } catch {
      // Disposal is terminal even if application DOM hooks throw.
    }
  }
}

function restoreHostAttributesIfUnchanged(
  host: HTMLElement,
  original: readonly HostAttributeSnapshot[],
  installed: readonly HostAttributeSnapshot[],
): void {
  const installedByName = new Map(
    installed.map((attribute) => [attribute.name, attribute.value] as const),
  );
  for (const attribute of original) {
    try {
      if (
        !installedByName.has(attribute.name) ||
        nativeGetAttribute(host, attribute.name) !==
          installedByName.get(attribute.name)
      ) {
        continue;
      }
      if (attribute.value === null) nativeRemoveAttribute(host, attribute.name);
      else nativeSetAttribute(host, attribute.name, attribute.value);
    } catch {
      // Startup rollback never overwrites an attribute it cannot still own.
    }
  }
}

function quiesceFaultedHost(host: HTMLElement): void {
  try {
    nativeSetAttribute(host, "contenteditable", "false");
  } catch {
    // The remaining independent fault guards still run.
  }
  try {
    nativeSetAttribute(host, "aria-disabled", "true");
  } catch {
    // Accessibility state is best-effort when application DOM hooks throw.
  }
  try {
    nativeSetAttribute(host, "inert", "");
  } catch {
    // `contenteditable=false` remains the primary native-mutation guard.
  }
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      nativeBlurHtmlElement(host);
      const ownerDocument = nativeOwnerDocument(host);
      if (
        ownerDocument === null ||
        nativeDocumentActiveElement(ownerDocument) !== host
      ) {
        return;
      }
    }
    // A synchronous blur hook may restore focus. The bounded retry above
    // verifies ordinary focus loss while the native inert/non-editable guards
    // remain authoritative if the platform refuses to release focus.
  } catch {
    // Losing focus is defense in depth after editing is already disabled.
  }
}

function clearOwnedHost(host: HTMLElement): void {
  try {
    nativeReplaceChildren(host);
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
  "browser_editor.presentation_invalid":
    "The browser render manifest does not exactly match the compiled profile.",
  "browser_editor.toolbar_profile_invalid":
    "The toolbar manifest does not exactly match the compiled semantic profile.",
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
