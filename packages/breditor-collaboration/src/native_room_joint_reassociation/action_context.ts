/** Internal finite-visitor context. Actual origin and target brands are checked
 * again by the receivers; copying this interface grants no live authority. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {ColdJointActivationOriginWork} from '../native_room_joint_activation/cold_origin.js';
import type {JointReassociationChoice} from './contract.js';
export interface ReassociationActionContext {
 readonly scope:SelectedNativeRecoveryScope;
 readonly witness:RoomMetadataTargetWitness;
 readonly origin:ColdJointActivationOriginWork;
 readonly choice:JointReassociationChoice;
 readonly options:SharedArchiveIntegrityOptions;
 check():void;
}
