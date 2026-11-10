/** Complete recovery capture at the same selected native cut as the sealed path. */
import {fields} from '../physical_room_record_cut/policy.js';
import {prepareMetadataPacketRecoveryInput} from './recovery_input.js';
import {prepareHandoverMetadataReconciliation} from '../selected_local_metadata_assets/handover_reconciliation.js';
import type {LocalMetadataHandoverReconciliationInput} from '../selected_local_metadata_assets/handover_reconciliation.js';
import type {ServerPacketRecoveryInput} from '../server_packet_recovery/contract.js';
import type {ReconciledServerPacketRecoveryCapture} from '../reconciled_server_packet_recovery/contract.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/handover.js';

export interface HandoverServerPacketRecoveryInput extends Omit<ServerPacketRecoveryInput,'host'> {
 readonly host:LocalMetadataHandoverReconciliationInput['host'];
 readonly path:LocalMetadataHandoverReconciliationInput['path'];
}
export interface HandoverReconciledServerPacketRecoveryCapture {
 readonly format:'breditor/handover-reconciled-server-packet-recovery';
 readonly formatVersion:1;
 readonly handover:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection;
 readonly capture:ReconciledServerPacketRecoveryCapture;
}

export function prepareHandoverPacketRecoveryInput(input:HandoverServerPacketRecoveryInput){
 const row=fields(input,['host','path','transport','server','inventory'],['limits']);
 const original=prepareMetadataPacketRecoveryInput({
  host:row['host'] as ServerPacketRecoveryInput['host'],
  transport:row['transport'] as ServerPacketRecoveryInput['transport'],
  server:row['server'] as ServerPacketRecoveryInput['server'],
  inventory:row['inventory'] as ServerPacketRecoveryInput['inventory'],
  ...(row['limits']===undefined?{}:{limits:row['limits'] as NonNullable<ServerPacketRecoveryInput['limits']>}),
 });
 const reconciliation=prepareHandoverMetadataReconciliation({
  host:row['host'] as LocalMetadataHandoverReconciliationInput['host'],
  path:row['path'] as LocalMetadataHandoverReconciliationInput['path'],
  inventory:row['inventory'] as LocalMetadataHandoverReconciliationInput['inventory'],
 });
 return Object.freeze({...original,reconciliation});
}
