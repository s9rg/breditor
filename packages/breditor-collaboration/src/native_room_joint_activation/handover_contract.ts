/** The complete whole-room choice for a sealed handover. The existing
 * same-origin plan, metadata-origin selection and intent remain distinct. */
import type {RoomHandoverActivationIntentChoice} from '../room_native_handover_activation_intent/contract.js';
import type {CommitHandoverRoomNativeActivationInput} from '../room_native_handover_activation_intent/coordinator_contract.js';
import type {HandoverMetadataContinuationInspectionInput,HandoverMetadataContinuationInput} from '../selected_local_metadata_continuation/handover_contract.js';
import type {JointRoomActivationPreparationInput} from './attempt_contract.js';
import type {JointRoomActivationIntentChoice,JointRoomActivationPlan} from './intent_contract.js';
import type {JointActivationMetadataOriginSelection} from './metadata_origin_contract.js';

export interface JointHandoverMetadataOriginSelection extends Omit<JointActivationMetadataOriginSelection,'format'|'activation'> {
 readonly format:'breditor/joint-handover-activation-metadata-origin';
 readonly activation:RoomHandoverActivationIntentChoice;
}
export interface JointHandoverActivationPlan extends Omit<JointRoomActivationPlan,'format'|'activation'|'origin'> {
 readonly format:'breditor/joint-native-handover-activation-plan';
 readonly activation:RoomHandoverActivationIntentChoice;
 readonly origin:Readonly<{
  selection:JointHandoverMetadataOriginSelection;
  reviewDatabase:string;
  metadataDatabase:string;
 }>;
}
export interface JointHandoverActivationIntentChoice extends Omit<JointRoomActivationIntentChoice,'format'|'plan'> {
 readonly format:'breditor/joint-native-handover-activation-intent';
 readonly plan:JointHandoverActivationPlan;
}
export interface JointHandoverActivationPreparationInput extends Omit<JointRoomActivationPreparationInput,'activation'|'retainChoice'> {
 readonly activation:RoomHandoverActivationIntentChoice;
 readonly retainChoice:(choice:JointHandoverActivationIntentChoice)=>void|Promise<void>;
}
export type JointHandoverNativeCommitInput=Omit<CommitHandoverRoomNativeActivationInput,'expected'>;
export type JointHandoverMetadataInput=Pick<HandoverMetadataContinuationInspectionInput,'path'|'inventory'|'checkAuthority'> &
 Pick<HandoverMetadataContinuationInput,'approve'>;
export interface JointHandoverPublicationInput extends JointHandoverMetadataInput {
 readonly approvePublication:(choice:JointHandoverActivationIntentChoice)=>boolean|Promise<boolean>;
}
