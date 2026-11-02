/** Strict source/installed surface for the additional same-reservation DATA API. */
import type {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {ServerPacketRecoveryInput} from '../../../packages/breditor-collaboration/dist/server_packet_recovery/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../../../packages/breditor-collaboration/dist/reconciled_server_packet_recovery/contract.js';
declare const owner:SelectedLocalMetadataDelivery,input:ServerPacketRecoveryInput;
const result:Promise<ReconciledServerPacketRecoveryCapture>=owner.captureReconciledServerPacketRecovery(input);
void result;
