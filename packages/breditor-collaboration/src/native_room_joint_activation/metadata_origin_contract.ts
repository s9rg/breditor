/** Literal association with the original complete activation capture. This
 * selection is DATA; it cannot supply a metadata owner or a replacement actor. */
import type {RoomActivationIntentChoice} from '../room_native_activation_intent/contract.js';
import type {DeliveryPreparationChoice} from '../selected_delivery_preparation/contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
export interface JointActivationMetadataOriginSelection {
 readonly format:'breditor/joint-activation-metadata-origin';readonly formatVersion:1;
 readonly activation:RoomActivationIntentChoice;
 readonly prepared:DeliveryPreparationChoice;readonly current:SelectedRoomCurrentSelection;
 readonly review:Readonly<{bytes:number;sha256:string}>;
 readonly metadata:Readonly<{bytes:number;sha256:string}>;
}
