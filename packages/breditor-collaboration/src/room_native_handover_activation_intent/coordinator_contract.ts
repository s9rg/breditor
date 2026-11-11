/** Explicit opt-in coordination with a separately provisioned inactive target. */
import type {LocalMetadataMaterializationOptions} from '../selected_local_metadata_assets/materialization_contract.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {HandoverServerPacketRecoveryInput} from '../metadata_packet_retention/handover_input.js';
import type {RoomHandoverActivationPreparationPolicy} from './prepare.js';
import type {RoomHandoverActivationCommitPolicy} from './commit.js';
export interface PrepareHandoverRoomNativeActivationInput extends Omit<RoomHandoverActivationPreparationPolicy,'path'> {
 readonly recovery:HandoverServerPacketRecoveryInput;
}
export interface CommitHandoverRoomNativeActivationInput extends RoomHandoverActivationCommitPolicy {
 readonly inspection:SharedServerLogGenerationRecoveryHost;
 readonly limits?:LocalMetadataMaterializationOptions['limits'];
}
