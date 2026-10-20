/** Explicit atomic retained-store profile. Native packets keep their original formats and limits. */
import type {SharedSuggestionQueueIdentity,SharedSuggestionQueueRecord} from "../suggestions/types.js";
import type {SharedSuggestionRevisionsRecord} from "../suggestion_revisions/types.js";
import type {SharedDocumentVersionsIdentity,SharedVersionCatalogRecord} from "../versions/types.js";
import type {SharedSegmentedRelaySessionOptions,SharedSegmentedRelayProgress} from "./contract.js";
import type {SharedSegmentedRecovery,SharedSegmentedRecoveryOptions} from "../persistence/segmented_session.js";
import type {SharedSelectionPolicy} from "../types.js";
export interface SharedSegmentedRetainedBinding {
 readonly suggestions:{readonly identity:SharedSuggestionQueueIdentity;readonly ownedHistory:"reviewed-v1"|null}|null;
 readonly revisions:{readonly binding:string}|null;
 readonly versions:SharedDocumentVersionsIdentity|null;
}
export interface SegmentedRetainedRecords {
 suggestions:SharedSuggestionQueueRecord|null;
 revisions:SharedSuggestionRevisionsRecord|null;
 versions:SharedVersionCatalogRecord|null;
}
export type SegmentedRetainedKind=keyof SegmentedRetainedRecords;
export type SharedSegmentedRetainedSessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=SharedSegmentedRelaySessionOptions<P>&{retained:SharedSegmentedRetainedBinding};
export interface SharedSegmentedRetainedRecovery {
 readonly format:"breditor/shared-relay-generation-retained-recovery";readonly formatVersion:1;
 readonly source:SharedSegmentedRecovery;readonly relay:SharedSegmentedRelayProgress;
 readonly retainedBinding:SharedSegmentedRetainedBinding;readonly retained:SegmentedRetainedRecords;
}
export type SharedSegmentedRetainedRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedSegmentedRecoveryOptions<P>,"recovery">&{binding:SharedSegmentedRelaySessionOptions<P>["binding"];retained:SharedSegmentedRetainedBinding;recovery:SharedSegmentedRetainedRecovery};
/** Separate outer budget, not an increase in any nested native or original 32 MiB store bound. */
export const MAX_SEGMENTED_RETAINED_HEAD_BYTES=224*1024*1024+64*1024;
