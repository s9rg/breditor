/** Explicit additional metadata DATA for every genuinely local selected lane.
 * Original room/history/review envelopes and their defaults remain literal. */
import type {LocalReviewDeliveryChoice,LocalReviewRoomBundle} from '../selected_local_review_delivery/contract.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedSegmentedRelayProgress} from '../segmented_relay/contract.js';
import type {SharedSegmentedRetainedBinding,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
export interface LocalMetadataInitialLane {readonly id:string;readonly binding:SharedSegmentedRetainedBinding;readonly records:SegmentedRetainedRecords}
export interface LocalMetadataDeliveryChoice {
 readonly format:'breditor/selected-local-metadata-delivery';readonly formatVersion:1;
 readonly database:string;readonly parent:LocalReviewDeliveryChoice;
 readonly lanes:readonly Readonly<{id:string;binding:SharedSegmentedRetainedBinding;initial:Readonly<{bytes:number;sha256:string}>}>[];
}
export interface LocalMetadataDeliveryState {
 readonly format:'breditor/selected-local-metadata-delivery-state';readonly formatVersion:1;
 readonly choice:LocalMetadataDeliveryChoice;readonly revision:number;
 readonly lanes:readonly Readonly<{id:string;source:SharedIndependentHistoryRecovery;relay:SharedSegmentedRelayProgress;records:SegmentedRetainedRecords}>[];
}
export interface LocalMetadataDeliverySnapshot {readonly before:LocalMetadataDeliveryState;readonly current:LocalMetadataDeliveryState}
/** A review-only or old room file cannot substitute for this complete bundle.
 * Nested original formats are retained without adding fields to them. */
export interface LocalMetadataRoomBundle {
 readonly format:'breditor/selected-local-metadata-room-bundle';readonly formatVersion:1;
 readonly parent:LocalReviewRoomBundle;
 readonly metadata:Readonly<{file:Blob;bytes:number;sha256:string}>;
}
