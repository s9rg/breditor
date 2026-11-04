/** A new association after Native restart. Original protocols and descriptors
 * remain literal immutable DATA. The linear predecessor list preserves earlier
 * attempts without recursively duplicating their original room plan. */
import type {JointRoomActivationIntentChoice} from '../native_room_joint_activation/intent_contract.js';
import type {RoomActivationIntentChoice} from '../room_native_activation_intent/contract.js';
import type {SharedNativeRoomPublicationSelection} from '../native_publication_control/contract.js';
import type {MetadataContinuationDestinations} from '../selected_local_metadata_continuation/contract.js';
import type {MetadataContinuationEvidence,MetadataContinuationAbsence} from '../selected_local_metadata_continuation/evidence_contract.js';
export type JointReassociationPriorMetadata=MetadataContinuationEvidence|MetadataContinuationAbsence;
export interface JointReassociationRecord {
 readonly database:string;
 readonly activation:RoomActivationIntentChoice;
 readonly publication:SharedNativeRoomPublicationSelection;
 readonly destinations:MetadataContinuationDestinations;
 readonly prior:JointReassociationPriorMetadata;
}
export interface JointReassociationPredecessor extends JointReassociationRecord {
 readonly bytes:number;readonly sha256:string;
}
export interface JointReassociationPlan extends JointReassociationRecord {
 readonly format:'breditor/joint-native-room-reassociation-plan';readonly formatVersion:1;
 readonly original:JointRoomActivationIntentChoice;
 readonly predecessors:readonly JointReassociationPredecessor[];
}
export interface JointReassociationChoice {
 readonly format:'breditor/joint-native-room-reassociation-intent';readonly formatVersion:1;
 readonly plan:JointReassociationPlan;
 readonly bytes:number;readonly sha256:string;
}
