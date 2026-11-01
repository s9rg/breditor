
/** Closed packet-recovery capture input. Reuse original genuine server, inventory,
 * asset transport and continuation admission before any task IO or callbacks. */
import {fields} from '../physical_room_record_cut/policy.js';
import {prepareLocalMetadataRecoveryBytesInput} from '../selected_local_metadata_assets/recovery_bytes_input.js';
import {prepareLocalMetadataReconciliationInput} from '../selected_local_metadata_assets/reconciliation_input.js';
import type {LocalMetadataPacketRecoveryInput} from './contract.js';
export function prepareMetadataPacketRecoveryInput(input:LocalMetadataPacketRecoveryInput){
 const row=fields(input,['host','transport','server','inventory'],['limits']);
 const original=prepareLocalMetadataRecoveryBytesInput(row as unknown as LocalMetadataPacketRecoveryInput);
 const reconciliation=prepareLocalMetadataReconciliationInput({host:row['host'] as LocalMetadataPacketRecoveryInput['host'],inventory:row['inventory'] as LocalMetadataPacketRecoveryInput['inventory']});
 return Object.freeze({...original,reconciliation});
}
export type PreparedMetadataPacketRecoveryInput=ReturnType<typeof prepareMetadataPacketRecoveryInput>;
