/** New closed atomic source/receipt/outbox family; original native and wire formats stay unchanged. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedRelayIdentity} from '../relay/types.js';
import type {SharedReviewRelayStorageIdentity} from '../relay/review_types.js';
import type {SharedIndependentHistorySessionOptions,SharedIndependentHistoryRecovery,IndependentHistoryIdentity} from '../independent_history/contract.js';
import type {SharedSegmentedRelayBinding,SharedSegmentedRelayProgress} from '../segmented_relay/contract.js';
import type {SharedSegmentedRetainedBinding,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
export type SharedIndependentDeliveryBinding=SharedSegmentedRelayBinding&{readonly review:SharedReviewRelayStorageIdentity};
/** Historical nonsecret identities, never current permissions or writer ownership. */
export interface SharedIndependentDeliveryIdentity {
 readonly history:IndependentHistoryIdentity;
 readonly binding:SharedIndependentDeliveryBinding;
 readonly retained:SharedSegmentedRetainedBinding;
}
export type SharedIndependentDeliveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=SharedIndependentHistorySessionOptions<P>&{
 binding:SharedIndependentDeliveryBinding&{
  document:P extends 'document-v1'?Omit<SharedRelayIdentity,'credential'>&{writerTransport:'atomic-v2'}:Omit<SharedRelayIdentity,'credential'>;
  review:P extends 'document-v1'?SharedReviewRelayStorageIdentity&{writerTransport:'atomic-v2'}:SharedReviewRelayStorageIdentity;
 };
 retained:SharedSegmentedRetainedBinding;
};
export interface SharedIndependentDeliveryRecovery {
 readonly format:'breditor/shared-independent-delivery-recovery';readonly formatVersion:1;
 readonly source:SharedIndependentHistoryRecovery;
 readonly relay:SharedSegmentedRelayProgress;
 readonly retainedBinding:SharedSegmentedRetainedBinding;readonly retained:SegmentedRetainedRecords;
}
export type SharedIndependentDeliveryRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=SharedIndependentDeliveryOptions<P>&{recovery:SharedIndependentDeliveryRecovery;writerRecovery:'host-reacquired'};
/** Nested original native/store limits are unchanged, including the 128 MiB source head. */
export const MAX_INDEPENDENT_DELIVERY_HEAD_BYTES=224*1024*1024+64*1024;
/** Complete native envelopes plus local versions and three original bounded retained records. */
export const MAX_INDEPENDENT_DELIVERY_RECOVERY_BYTES=352*1024*1024+64*1024;
