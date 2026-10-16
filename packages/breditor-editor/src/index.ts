/** Local-rich package root. Optional React and shared runtimes have separate module graphs. */
export {openLocalEditor,createLocalProfile,createStructuralLocalProfileV2,standardProfileBootstrapJson,structuralProfileBootstrapJsonV2,type LocalEditor,type LocalEditorOptions,type LocalInitial} from "./local.js";
export {initializeLocalRuntime,type RuntimeInput} from "./runtime.js";
export {emptyDocumentJson} from "./empty_document.js";
export {RichAssetStore,RichLocalSessionStore,defaultAssetLimits,createStandardRichInlinePresentationV1,createStandardRichToolbarV1,createStructuralRichToolbarV2,createFlowNavigationControls,standardInlineKindsV1,standardInlinePropertiesV1,standardInlineStylesV1} from "@breditor/experimental-rich-content";
export type {RichCommand,RichView,RichSelection,RichPoint,RichCell,FormatLiteral,RichCoreEditor,RichCoreProfile,RichInlinePresentation,ToolbarControl,AssetInfo,AssetLimits,AssetUploader,FlowPosition,FlowDraft} from "@breditor/experimental-rich-content";
