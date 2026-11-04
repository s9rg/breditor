/** Explicit owner actions. Every approval receives inert complete choice DATA;
 * genuine controls, execution actors and the target witness remain separate. */
import type {ColdJointRoomActivationOptions,ColdJointRoomReplacementInput} from '../native_room_joint_activation/cold_contract.js';
import type {JointRoomNativeCommitInput,JointRoomMetadataInput} from '../native_room_joint_activation/attempt_contract.js';
import type {JointRoomActivationIntentChoice} from '../native_room_joint_activation/intent_contract.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import type {JointReassociationChoice} from './contract.js';
import type {JointReassociationCaptureInput} from './capture.js';
export interface JointReassociationBeginOptions {readonly original:JointRoomActivationIntentChoice;readonly execution:ColdJointRoomActivationOptions['execution']}
export interface JointReassociationResumeOptions {readonly expected:JointReassociationChoice;readonly execution:ColdJointRoomActivationOptions['execution']}
export interface JointReassociationPreparationInput extends JointReassociationCaptureInput {readonly retainChoice:(choice:JointReassociationChoice)=>void|Promise<void>}
/** Completing retained DATA after an interrupted write needs no retired HTTP
 * requester. Actual Native confirmation still needs a separately supplied host. */
export interface JointReassociationPreparationResumeInput {readonly retainChoice:(choice:JointReassociationChoice)=>void|Promise<void>}
export type JointReassociationReplacementInput=ColdJointRoomReplacementInput;
export interface JointReassociationCommitInput extends Omit<JointRoomNativeCommitInput,'approve'> {readonly approve:(choice:JointReassociationChoice)=>boolean|Promise<boolean>}
export interface JointReassociationCommitResult {
 readonly format:'breditor/reassociated-native-activation-result';readonly formatVersion:1;
 readonly choice:JointReassociationChoice;readonly receipt:SharedDurableNativeActivationReceipt;
 readonly scope:'actual-private-client-target-and-reassociated-native-service';
}
export type JointReassociationMetadataInput=JointRoomMetadataInput;
export interface JointReassociationPublicationInput extends JointRoomMetadataInput {readonly approvePublication:(choice:JointReassociationChoice)=>boolean|Promise<boolean>}
export type JointReassociationPublicationHost=SharedNativeRoomPublicationHost;
