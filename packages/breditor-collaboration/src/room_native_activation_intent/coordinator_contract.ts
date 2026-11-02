import type {LocalMetadataMaterializationOptions} from '../selected_local_metadata_assets/materialization_contract.js';
/** Explicit opt-in local/remote coordination inputs. No saved value carries policy. */
import type {ServerPacketRecoveryInput} from '../server_packet_recovery/contract.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {RoomActivationPreparationPolicy} from './prepare.js';
import type {RoomActivationCommitPolicy} from './commit.js';
export interface PrepareRoomNativeActivationInput extends RoomActivationPreparationPolicy {
 readonly recovery:ServerPacketRecoveryInput;
}
export interface CommitRoomNativeActivationInput extends RoomActivationCommitPolicy {
 /** Genuine separately selected historical Native reader for the retained server bytes. */
 readonly inspection:SharedServerLogGenerationRecoveryHost;
 readonly limits?:LocalMetadataMaterializationOptions['limits'];
}
