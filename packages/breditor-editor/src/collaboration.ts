/** Optional entry: importing the local package root never imports this module or its Wasm. */
export * from "@breditor/collaboration";
export {initializeSharedRuntime,createSharedProfile,createStructuralSharedProfileV2,standardSharedProfileConfiguration,structuralSharedProfileConfigurationV2} from "./shared_profile.js";
export {openSharedEditor,SharedEditorOpenError,type SharedEditorRecovery,type SharedEditorSession,type SharedEditorSessionOptions,type SharedInitial} from "./shared_session.js";
