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
  type BreditorBrowserEditorPersistenceScope,
  type BreditorBrowserEditorPersistenceResult,
  type BreditorBrowserEditorPersistenceStatus,
  type BreditorBrowserEditorSnapshot,
  type BreditorBrowserEditorStatus,
  type BreditorBrowserEditorSubscriber,
  type BreditorBrowserDocumentSnapshot,
  type BreditorBrowserInitialDocument,
  type BreditorBrowserIntentRejectionReason,
  type BreditorBrowserIntentResult,
  type BreditorBrowserSemanticProfileOptions,
  type BreditorBrowserToolbarOptions,
  type BreditorBrowserWasmModule,
} from "./browser_editor.js";

/** Public compatibility value and bootstrap shapes for initialized Wasm modules. */
export {
  BREDITOR_BROWSER_PACKAGE_VERSION,
  BREDITOR_WASM_ABI_VERSION,
  MAX_WASM_BOOTSTRAP_HISTORY_CAPACITY,
  MAX_WASM_PROFILE_BOOTSTRAP_JSON_BYTES,
} from "./wasm_engine_bootstrap.js";

/** Callback-free inline-format presentation declarations. */
export {
  DEFAULT_INLINE_FORMAT_RENDER_MANIFEST,
  INLINE_FORMAT_RENDER_ELEMENTS,
  MAX_INLINE_FORMAT_RENDER_CLASSES_PER_RECIPE,
  MAX_INLINE_FORMAT_RENDER_CLASS_TOKEN_ASCII,
  MAX_INLINE_FORMAT_RENDER_FORMAT_KIND_ASCII,
  MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES,
  MAX_INLINE_FORMAT_RENDER_ORDER_REFERENCES_PER_RECIPE,
  MAX_INLINE_FORMAT_RENDER_RECIPES,
  createInlineFormatRenderManifest,
  type InlineFormatRenderElement,
  type InlineFormatRenderManifest,
  type InlineFormatRenderRecipe,
} from "./inline_format_render_manifest.js";
export {
  MAX_INLINE_FORMAT_SAFE_LINK_HREF_UTF8_BYTES,
  type InlineFormatRenderAttribute,
  type InlineFormatRenderAttributePolicy,
  type InlineFormatRenderSafeLinkV1Policy,
} from "./inline_format_render_attributes.js";

/** Declarative toolbar extension surface. */
export {
  BASE_TOOLBAR_STATE_IDS,
  DEFAULT_TOOLBAR_MANIFEST,
  MAX_TOOLBAR_CONTROLS,
  MAX_TOOLBAR_GROUP_UTF16,
  MAX_TOOLBAR_GROUP_UTF8,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_FIELDS_TOTAL,
  MAX_TOOLBAR_INLINE_FORMAT_FORM_STRING_UTF8,
  MAX_TOOLBAR_LABEL_UTF16,
  MAX_TOOLBAR_LABEL_UTF8,
  MAX_TOOLBAR_QUALIFIED_NAME_ASCII,
  MIN_TOOLBAR_CONTROLS,
  MIN_TOOLBAR_INLINE_FORMAT_FORM_FIELDS,
  createToolbarManifest,
  type ToolbarButtonDeclaration,
  type ToolbarCommandDeclaration,
  type ToolbarControlDeclaration,
  type ToolbarInlineFormatFormBooleanFieldDeclaration,
  type ToolbarInlineFormatFormDeclaration,
  type ToolbarInlineFormatFormFieldDeclaration,
  type ToolbarInlineFormatFormStringFieldDeclaration,
  type ToolbarManifest,
} from "./toolbar_manifest.js";
export {
  TOOLBAR_INLINE_FORMAT_FORM_REMOVE_INPUT_JSON,
  createToolbarInlineFormatFormRemoveInputJson,
  createToolbarInlineFormatFormSetInputJson,
  type ToolbarInlineFormatFormValues,
} from "./toolbar_inline_format_form_input.js";

/** Public command-input bounds and typed-JSON preflight. */
export {
  BASE_INTENT_IDS,
  MAX_BROWSER_COMMAND_JSON_UTF16,
  MAX_BROWSER_COMMAND_JSON_UTF8,
  MAX_BROWSER_COMMAND_TEXT_UTF16,
  MAX_BROWSER_COMMAND_TEXT_UTF8,
  browserCommandJsonIsAdmissible,
} from "./editor_command.js";

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
export {
  DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS,
  DEFAULT_SESSION_CHECKPOINT_AUTOSAVE_MAX_LATENCY_MS,
  MAX_SESSION_CHECKPOINT_AUTOSAVE_DELAY_MS,
  MAX_SESSION_CHECKPOINT_AUTOSAVE_FLUSH_WAITERS,
} from "./session_checkpoint_autosave.js";
export type {
  SessionCheckpointAutosaveFailure,
  SessionCheckpointAutosaveFailureCode,
  SessionCheckpointAutosaveFlushResult,
  SessionCheckpointAutosaveOptions,
  SessionCheckpointAutosaveScheduler,
  SessionCheckpointAutosaveStatus,
} from "./session_checkpoint_autosave.js";
