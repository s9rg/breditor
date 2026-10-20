/** Explicit relay-local storage contract. Existing causal wire versions and counters are unchanged. */
import type {SharedWriterClock,SharedSelectionPolicy} from "../types.js";
import type {SharedReviewBatchReceipt} from "../review_types.js";
import type {SharedReviewRelayStorageIdentity,SharedReviewRelayProgress} from "../relay/review_types.js";
import type {SharedRelayIdentity,SharedRelayOptions} from "../relay/types.js";
import type {SharedSegmentedSessionOptions,SharedSegmentedRecovery,SharedSegmentedRecoveryOptions} from "../persistence/segmented_session.js";
export interface SharedSegmentedRelayBinding {
 readonly document:Omit<SharedRelayIdentity,"credential">;
 readonly review:SharedReviewRelayStorageIdentity|null;
}
export interface SharedSegmentedDocumentReceipt {
 readonly sequence:string;
 readonly receipt:{readonly writer:string;readonly from:string;readonly through:string;readonly groupDigest:string;readonly prefixDigest:string};
}
export interface SharedSegmentedDocumentProgress {readonly accepted:SharedWriterClock|null;readonly receipt:SharedSegmentedDocumentReceipt|null}
export interface SharedSegmentedReviewReceipt {readonly sequence:string;readonly receipt:SharedReviewBatchReceipt}
/** Stored counters/receipts are continuity inputs, never current permissions or writer leases. */
export interface SharedSegmentedRelayProgress {
 readonly binding:SharedSegmentedRelayBinding;
 readonly document:SharedSegmentedDocumentProgress;
 readonly review:SharedReviewRelayProgress|null;
 readonly reviewReceipt:SharedSegmentedReviewReceipt|null;
}
export type SharedSegmentedRelaySessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=SharedSegmentedSessionOptions<P>&{binding:SharedSegmentedRelayBinding&{document:P extends "document-v1"?Omit<SharedRelayIdentity,"credential">&{writerTransport:"atomic-v2"}:Omit<SharedRelayIdentity,"credential">}};
export interface SharedSegmentedRelayRecovery {
 readonly format:"breditor/shared-relay-generation-recovery";readonly formatVersion:1;
 readonly source:SharedSegmentedRecovery;readonly relay:SharedSegmentedRelayProgress;
}
export type SharedSegmentedRelayRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedSegmentedRecoveryOptions<P>,"recovery">&{binding:SharedSegmentedRelaySessionOptions<P>["binding"];recovery:SharedSegmentedRelayRecovery};
export type SharedSegmentedRelaySyncOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedRelayOptions<P>,"selectionEditing"|"persistLocal"|"identity">&{identity:P extends "document-v1"?SharedRelayIdentity&{writerTransport:"atomic-v2"}:SharedRelayIdentity};
export const MAX_SEGMENTED_RELAY_METADATA_BYTES=16*1024;
export const MAX_SEGMENTED_RELAY_HEAD_BYTES=128*1024*1024+64*1024;
