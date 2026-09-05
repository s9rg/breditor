export type { AstPath } from "./ast_path.js";
export { astPathsEqual } from "./ast_path.js";
export {
  BaseDocumentProjection,
  type BaseDocumentProjectionInput,
  type BaseParagraphProjection,
  type BaseProjectionSchema,
  type BaseTextRunProjection,
  type ProjectionSnapshot,
} from "./projection.js";
export {
  BaseProjectionUpdate,
  type BaseProjectionImpact,
  type BaseProjectionUpdateInput,
  type FullProjectionReason,
  type RootChildRange,
} from "./projection_update.js";
export {
  BreditorDomRenderer,
  type ProjectionFallbackReason,
  type ProjectionRenderMode,
  type ProjectionRenderOutcome,
  type RenderedProjection,
} from "./dom_renderer.js";
export {
  BreditorDomSelectionBridge,
  type DomFocusObservation,
  type DomSelectionAffinityPolicy,
  type DomSelectionObservation,
  type DomSelectionOrigin,
  type DomSelectionUnavailableReason,
  type DomSelectionWriteOutcome,
} from "./dom_selection.js";
export {
  BaseRangeSelection,
  type BaseChildrenSelectionPoint,
  type BaseEditorSelection,
  type BaseRangeOrder,
  type BaseRangeSelectionInput,
  type BaseSelectionPoint,
  type BaseTextSelectionPoint,
  type SelectionAffinity,
} from "./selection.js";
export type {
  BrowserSelectionError,
  BrowserSelectionErrorCode,
  BrowserSelectionResult,
} from "./selection_result.js";
export type {
  BrowserProjectionError,
  BrowserProjectionErrorCode,
  BrowserProjectionResult,
} from "./result.js";
export {
  consumeSemanticProjection,
  consumeSemanticProjectionUpdate,
  type SemanticProjectionImpact,
  type SemanticProjectionUpdateView,
  type SemanticProjectionView,
} from "./wasm_projection_adapter.js";
export {
  consumeSemanticSelection,
  semanticRangeSelectionScalars,
  type SemanticRangeSelectionScalars,
  type SemanticSelectionPointKind,
  type SemanticSelectionView,
} from "./wasm_selection_adapter.js";
