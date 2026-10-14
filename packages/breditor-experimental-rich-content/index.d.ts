import type {RichWasmModule,RichCoreProfile} from "./dist/browser/core.js";
export type * from "./dist/browser/core.js";
export {mountRichEditor,RichDomEditor,defaultToolbar,RichAssetStore,defaultAssetLimits,insertImageFiles,type RichEditorOptions,type ToolbarControl,type ActionContext,type AssetBinding,type RenderOptions,type RichAssetOptions,type AssetInfo,type AssetLimits,type AssetStatus,type AssetUploader,type RasterMime} from "./dist/browser/index.js";
export class RichCommandError extends Error {readonly code: string; constructor(code: string, message: string)}
export function compileRichProfile(wasm:RichWasmModule,bootstrapJson:string):RichCoreProfile;
export {RichLocalSessionStore} from "./dist/browser/index.js";
