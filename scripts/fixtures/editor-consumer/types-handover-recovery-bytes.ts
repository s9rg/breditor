import type {SelectedLocalMetadataDelivery} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import type {HandoverServerPacketRecoveryInput,HandoverReconciledServerPacketRecoveryCapture} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/handover_input.js';
import type {ServerPacketRecoveryInput} from '../../../packages/breditor-collaboration/dist/server_packet_recovery/contract.js';
declare const owner:SelectedLocalMetadataDelivery,input:HandoverServerPacketRecoveryInput,legacy:ServerPacketRecoveryInput;
const captured:Promise<HandoverReconciledServerPacketRecoveryCapture>=owner.captureReconciledServerPacketRecoveryAcrossHandover(input);
void captured;
// @ts-expect-error A complete selected handover path is required.
owner.captureReconciledServerPacketRecoveryAcrossHandover(legacy);
