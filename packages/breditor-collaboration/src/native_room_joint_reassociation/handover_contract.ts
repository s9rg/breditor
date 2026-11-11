/** A restart association for a complete sealed room. The original descriptor
 * and earlier attempts stay independently pinned in their own namespaces. */
import type {JointHandoverActivationIntentChoice} from '../native_room_joint_activation/handover_contract.js';
import type {RoomHandoverActivationIntentChoice} from '../room_native_handover_activation_intent/contract.js';
import type {HandoverMetadataContinuationEvidence,MetadataContinuationAbsence} from '../selected_local_metadata_continuation/evidence_contract.js';
import type {JointReassociationRecord} from './contract.js';

export type JointHandoverReassociationPrior=HandoverMetadataContinuationEvidence|MetadataContinuationAbsence;
export interface JointHandoverReassociationRecord extends Omit<JointReassociationRecord,'activation'|'prior'> {
 readonly activation:RoomHandoverActivationIntentChoice;
 readonly prior:JointHandoverReassociationPrior;
}
export interface JointHandoverReassociationPredecessor extends JointHandoverReassociationRecord {
 readonly bytes:number;
 readonly sha256:string;
}
export interface JointHandoverReassociationPlan extends JointHandoverReassociationRecord {
 readonly format:'breditor/joint-native-handover-reassociation-plan';
 readonly formatVersion:1;
 readonly original:JointHandoverActivationIntentChoice;
 readonly predecessors:readonly JointHandoverReassociationPredecessor[];
}
export interface JointHandoverReassociationChoice {
 readonly format:'breditor/joint-native-handover-reassociation-intent';
 readonly formatVersion:1;
 readonly plan:JointHandoverReassociationPlan;
 readonly bytes:number;
 readonly sha256:string;
}
