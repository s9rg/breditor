/** Actual reader/controller identities and lifetimes, before capture IO.
 * Never call public shadows or accept matching structural reader methods. */
import {fields} from '../physical_room_record_cut/policy.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import {generationDeliveryRecoveryHostPort} from '../generation_delivery_control/host.js';
import {equal} from '../selected_local_metadata_delivery/data.js';
import type {LocalMetadataReconciliationInput} from './reconciliation_contract.js';
import {fail} from './error.js';
const file=Inventory.prototype.file,identity=Inventory.prototype.identity,metadata=Inventory.prototype.metadata;
export function prepareLocalMetadataReconciliationInput(provided:LocalMetadataReconciliationInput){
 const r=fields(provided,['host','inventory']),host=r['host'] as LocalMetadataReconciliationInput['host'],reader=r['inventory'] as Inventory;
 const port=generationDeliveryRecoveryHostPort(host),held=file.call(reader),selected=identity.call(reader),value=metadata.call(reader),current=port.selection.continuation.current;
 if(!equal(selected,current.participants)||!equal(selected.source,current.server.native)||!equal(value.source,current.server.native))throw fail('local_metadata_assets_state');
 const check=()=>{if(file.call(reader)!==held||identity.call(reader)!==selected||metadata.call(reader)!==value)throw fail('local_metadata_assets_changed');};
 check();return Object.freeze({host,reader,port,metadata:value.native,check});
}
export type PreparedLocalMetadataReconciliation=ReturnType<typeof prepareLocalMetadataReconciliationInput>;
