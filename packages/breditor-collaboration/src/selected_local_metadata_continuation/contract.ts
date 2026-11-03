/** Explicit namespace continuation DATA. Original before/current journals remain
 * immutable evidence; fresh destination baselines do not erase old facts. */
import type {SharedServerLogGenerationDeliveryRecoveryControlSelection} from '../generation_delivery_control/contract.js';
import type {RoomRunIdentity} from '../native_room_execution_run/contract.js';
import type {DeliveryPreparationChoice} from '../selected_delivery_preparation/contract.js';
import type {LocalReviewDeliveryChoice} from '../selected_local_review_delivery/contract.js';
import type {LocalMetadataDeliveryChoice,LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
export interface MetadataContinuationDestinations{readonly database:string;readonly preparationDatabase:string;readonly reviewDatabase:string;readonly metadataDatabase:string}
export interface MetadataContinuationChoice{
 readonly format:'breditor/selected-local-metadata-continuation';readonly formatVersion:1;
 readonly database:string;readonly execution:RoomRunIdentity;readonly delivery:SharedServerLogGenerationDeliveryRecoveryControlSelection;
 readonly origin:Readonly<{choice:LocalMetadataDeliveryChoice;prepared:DeliveryPreparationChoice;current:SelectedRoomCurrentSelection;review:Readonly<{bytes:number;sha256:string}>;metadata:Readonly<{bytes:number;sha256:string}>}>;
 readonly prepared:DeliveryPreparationChoice;readonly target:SelectedRoomCurrentSelection;
 readonly review:LocalReviewDeliveryChoice;readonly metadata:LocalMetadataDeliveryChoice;
}
export interface MetadataContinuationResult{readonly format:'breditor/selected-local-metadata-continued';readonly formatVersion:1;readonly choice:MetadataContinuationChoice;readonly origin:LocalMetadataRoomBundle;readonly current:LocalMetadataRoomBundle}
