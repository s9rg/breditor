/** Complete joint association DATA. Every referenced archive is independently
 * retained before this descriptor is committed. This format conveys no actor,
 * server, metadata acknowledgement or current authority. */
import type {RoomActivationIntentChoice,RoomActivationBlobPin} from '../room_native_activation_intent/contract.js';
import type {RoomRunIdentity} from '../native_room_execution_run/contract.js';
import type {SharedNativeRoomPublicationSelection} from '../native_publication_control/contract.js';
import type {MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import type {JointActivationMetadataOriginSelection} from './metadata_origin_contract.js';
export interface JointRoomActivationPlan {
 readonly format:'breditor/joint-native-room-activation-plan';readonly formatVersion:1;
 readonly database:string;
 readonly sourceNamespaces:readonly string[];
 readonly activation:RoomActivationIntentChoice;
 readonly execution:RoomRunIdentity;
 readonly origin:Readonly<{selection:JointActivationMetadataOriginSelection;reviewDatabase:string;metadataDatabase:string}>;
 readonly destinations:MetadataContinuationDestinations;
 readonly publication:SharedNativeRoomPublicationSelection;
}
export interface JointRoomActivationIntentChoice extends RoomActivationBlobPin {
 readonly format:'breditor/joint-native-room-activation-intent';readonly formatVersion:1;
 readonly plan:JointRoomActivationPlan;
}
