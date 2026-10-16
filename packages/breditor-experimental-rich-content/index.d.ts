import type {RichWasmModule,RichCoreProfile} from "./dist/browser/core.js";
export type * from "./dist/browser/core.js";
export {mountRichEditor,RichDomEditor,defaultToolbar,RichAssetStore,defaultAssetLimits,insertImageFiles,type RichEditorOptions,type ToolbarControl,type ActionContext,type AssetBinding,type RenderOptions,type RichAssetOptions,type AssetInfo,type AssetLimits,type AssetStatus,type AssetUploader,type RasterMime} from "./dist/browser/index.js";
export class RichCommandError extends Error {readonly code: string; constructor(code: string, message: string)}
export function compileRichProfile(wasm:RichWasmModule,bootstrapJson:string):RichCoreProfile;
export function compileStandardRichProfileV1(wasm:RichWasmModule,bootstrapJson:string):RichCoreProfile;
export function compileStructuralRichProfileV2(wasm:RichWasmModule,bootstrapJson:string):RichCoreProfile;
export function compileStandardStructuralRichProfileV2(wasm:RichWasmModule,bootstrapJson:string):RichCoreProfile;
export function compileLayoutRichProfileV3(wasm:RichWasmModule,bootstrapJson:string):RichCoreProfile;
export function compileStandardLayoutRichProfileV3(wasm:RichWasmModule,bootstrapJson:string):RichCoreProfile;
export {createStructuralRichToolbarV2} from "./dist/browser/index.js";
export {createLayoutRichToolbarV3} from "./dist/browser/index.js";
export {createFlowNavigationControls} from "./dist/browser/index.js";
export {createSelectionRichToolbarV1} from "./dist/browser/index.js";
export {RichLocalSessionStore} from "./dist/browser/index.js";
export {RichDocumentSessionStore,type RichDocumentSessionStoreOptions} from "./dist/browser/index.js";
export {createRichInlinePresentation,type RichInlinePresentation,type RichInlineSchema} from "./dist/browser/index.js";
export {createStandardRichInlinePresentationV1,standardInlineKindsV1,standardInlinePropertiesV1,standardInlineStylesV1} from "./dist/browser/index.js";
export {createStandardRichToolbarV1,type RichToolbarField,type RichToolbarReading} from "./dist/browser/index.js";
