import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionQueueOptions,SharedSuggestionQueueIdentity} from "../suggestions/types.js";
import type {SharedSuggestionRevisionsOptions} from "../suggestion_revisions/types.js";
import type {SharedDocumentVersionsOptions,SharedDocumentVersionsIdentity} from "../versions/types.js";
/** These archives retain dependent intent/cache state, never source journals or current grants. */
export type SharedRetainedStoreKind="suggestions"|"suggestion-revisions"|"version-catalog";
export interface SharedRetainedStoreBackup {
 readonly format:"breditor/shared-retained-store-backup";readonly formatVersion:1;
 readonly kind:SharedRetainedStoreKind;readonly recordJson:string;readonly sha256:string;
}
export interface SharedRetainedStoreBackupOptions {readonly signal?:AbortSignal}
/** Explicit host-selected source policy when wrapping exact captured records from a larger archive. */
export type SharedRetainedStoreBackupSource=
 |Readonly<{kind:"suggestions";identity:SharedSuggestionQueueIdentity;ownedHistory?:"reviewed-v1"}>
 |Readonly<{kind:"suggestion-revisions";identity:SharedSuggestionQueueIdentity;binding:string}>
 |Readonly<{kind:"version-catalog";identity:SharedDocumentVersionsIdentity}>;
/** Host acknowledgement only: the library cannot fence an original writer on another device. */
export interface SharedRetainedStoreRecovery extends SharedRetainedStoreBackupOptions {
 readonly backupJson:string;readonly writerRecovery:"host-reacquired";
}
export interface SharedSuggestionQueueBackupOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedSuggestionQueueOptions<P>,SharedRetainedStoreRecovery {}
export interface SharedSuggestionRevisionsBackupOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedSuggestionRevisionsOptions<P>,SharedRetainedStoreRecovery {autoStart?:false}
export interface SharedDocumentVersionsBackupOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedDocumentVersionsOptions<P>,SharedRetainedStoreRecovery {autoConnect?:false}
