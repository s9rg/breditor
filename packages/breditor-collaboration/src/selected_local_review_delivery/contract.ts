/** New opt-in local-review delivery DATA. Old local/history/room protocols stay closed.
 * Nonsecret bindings and saved receipts are not authentication or writer grants. */
import type {IndependentHistoryIdentity,SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {SharedReviewRelayStorageIdentity} from '../relay/review_types.js';
import type {SharedSegmentedRelayProgress} from '../segmented_relay/contract.js';
import type {SelectedRoomCurrentFile,SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {DeliveryPreparationFile} from '../selected_delivery_preparation/contract.js';
export interface LocalReviewBinding {readonly id:string;readonly binding:SharedReviewRelayStorageIdentity}
export interface LocalReviewDeliveryChoice {
 readonly format:'breditor/selected-local-review-delivery';readonly formatVersion:1;
 readonly database:string;readonly before:SelectedRoomCurrentSelection;
 readonly lanes:readonly Readonly<{id:string;family:RecordPayloadFamily;source:IndependentHistoryIdentity;binding:SharedReviewRelayStorageIdentity}>[];
}
export interface LocalReviewDeliveryState {
 readonly format:'breditor/selected-local-review-delivery-state';readonly formatVersion:1;
 readonly choice:LocalReviewDeliveryChoice;readonly revision:number;
 readonly lanes:readonly Readonly<{id:string;source:SharedIndependentHistoryRecovery;relay:SharedSegmentedRelayProgress}>[];
}
export interface LocalReviewDeliverySnapshot {readonly before:LocalReviewDeliveryState;readonly current:LocalReviewDeliveryState}
/** Complete new-layer export: original whole-room before-file, exact CURRENT
 * whole-room native/packet/upload file and EVERY bound-local durable record.
 * This is deliberately not accepted as an old SelectedRoomCurrentFile. */
export interface LocalReviewRoomBundle {
 readonly format:'breditor/selected-local-review-room-bundle';readonly formatVersion:1;
 readonly prepared:DeliveryPreparationFile;readonly current:SelectedRoomCurrentFile;
 readonly delivery:Readonly<{file:Blob;bytes:number;sha256:string}>;
}
