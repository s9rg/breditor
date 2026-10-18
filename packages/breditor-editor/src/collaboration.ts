/** Optional entry: importing the local package root never imports this module or its Wasm. */
export * from "@breditor/collaboration";
export {initializeSharedRuntime,createSharedProfile,createStructuralSharedProfileV2,createLayoutSharedProfileV3,standardSharedProfileConfiguration,structuralSharedProfileConfigurationV2,layoutSharedProfileConfigurationV3} from "./shared_profile.js";
export {openSharedEditor,SharedEditorOpenError,type SharedEditorRecovery,type SharedEditorSession,type SharedEditorSessionOptions,type SharedInitial} from "./shared_session.js";
export {openSharedDocumentEditor,SharedDocumentEditorOpenError,type SharedDocumentEditorRecovery,type SharedDocumentEditorSession,type SharedDocumentEditorSessionOptions,type SharedDocumentInitial} from "./shared_document_session.js";
export {openSharedSearchEditor,type SharedSearchInitial,type SharedSearchEditorSessionOptions} from "./shared_session.js";
export {openSharedDocumentSearchEditor,type SharedDocumentSearchEditorSessionOptions} from "./shared_document_session.js";
