/** High-level framework-neutral browser runtime. */
export {
  BreditorBrowserEditor,
  MAX_BROWSER_EDITOR_LABEL_UTF16,
  MAX_BROWSER_EDITOR_SUBSCRIBERS,
  openBreditorBrowserEditor,
  type BreditorBrowserContentExport,
  type BreditorBrowserContentExportError,
  type BreditorBrowserContentExportResult,
  type BreditorBrowserContentFormat,
  type BreditorBrowserEditorFaultReason,
  type BreditorBrowserEditorOpenError,
  type BreditorBrowserEditorOpenResult,
  type BreditorBrowserEditorOptions,
  type BreditorBrowserEditorPersistenceOptions,
  type BreditorBrowserEditorPersistenceResult,
  type BreditorBrowserEditorPersistenceStatus,
  type BreditorBrowserEditorSnapshot,
  type BreditorBrowserEditorStatus,
  type BreditorBrowserEditorSubscriber,
  type BreditorBrowserDocumentSnapshot,
  type BreditorBrowserInitialDocument,
  type BreditorBrowserToolbarOptions,
  type BreditorBrowserWasmFactory,
  type BreditorBrowserWasmModule,
} from "./browser_editor.js";

/** Public compatibility value and bootstrap shapes for initialized Wasm modules. */
export {
  BREDITOR_WASM_ABI_VERSION,
  MAX_WASM_BOOTSTRAP_HISTORY_CAPACITY,
} from "./wasm_engine_bootstrap.js";

/** Declarative toolbar extension surface. */
export {
  BASE_TOOLBAR_STATE_IDS,
  DEFAULT_TOOLBAR_MANIFEST,
  MAX_TOOLBAR_CONTROLS,
  createToolbarManifest,
  type ToolbarCommandDeclaration,
  type ToolbarControlDeclaration,
  type ToolbarManifest,
} from "./toolbar_manifest.js";

/** Host-selected keyboard behavior. */
export type { KeyboardTranslationPolicy } from "./keyboard.js";

/** Read-only action-state and persistence snapshots exposed by the runtime. */
export type {
  ActionStateStoreError,
  ActionStateStoreStatus,
} from "./action_state_store.js";
export type {
  BrowserActionStateActivation,
  BrowserActionStateAvailability,
  BrowserActionStateEntry,
  BrowserActionStateReadError,
  BrowserActionStateSnapshot,
  BrowserActionStateValue,
  BrowserActionStateValueContract,
  BrowserActionStateValueStatus,
  BrowserActionValue,
  BrowserActionValueArray,
  BrowserActionValueObject,
} from "./wasm_action_state_adapter.js";
export type {
  SessionCheckpointAutosaveFailure,
  SessionCheckpointAutosaveFailureCode,
  SessionCheckpointAutosaveFlushResult,
  SessionCheckpointAutosaveOptions,
  SessionCheckpointAutosaveScheduler,
  SessionCheckpointAutosaveStatus,
} from "./session_checkpoint_autosave.js";
