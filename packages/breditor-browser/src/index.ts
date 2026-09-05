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
