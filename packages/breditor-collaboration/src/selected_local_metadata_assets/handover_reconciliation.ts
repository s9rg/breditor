/** Bind the current metadata reader to an authenticated path through the original catalog. */
import {generationDeliveryPathRecoveryHostPort} from '../generation_delivery_path_control/host.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection} from '../generation_delivery_path_control/handover.js';
import {containsOrderedDeliveryCuts,handoverDeliveryCuts} from '../generation_delivery_path_control/retained_cuts.js';
import type {PhysicalRoomCatalogV3Metadata} from '../physical_room_catalog_v3/contract.js';
import type {LocalMetadataReconciliationInput} from './reconciliation_contract.js';
import type {ServerPacketReconciliationRead} from '../server_packet_reconciliation/contract.js';
import {prepareLocalMetadataReconciliationInput} from './reconciliation_input.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {equal} from '../selected_local_metadata_delivery/data.js';
import {fail} from './error.js';

export interface LocalMetadataHandoverReconciliationInput extends LocalMetadataReconciliationInput {
 readonly path:SharedServerLogGenerationDeliveryPathRecoveryHost;
}
export interface HandoverServerPacketReconciliationRead {
 readonly format:'breditor/selected-local-handover-server-packet-reconciliation-read';
 readonly formatVersion:1;
 readonly handover:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection;
 readonly read:ServerPacketReconciliationRead;
}
export interface MetadataHandover {
 readonly host:SharedServerLogGenerationDeliveryPathRecoveryHost;
 readonly port:ReturnType<typeof generationDeliveryPathRecoveryHostPort>;
}
export function prepareHandoverMetadataReconciliation(provided:LocalMetadataHandoverReconciliationInput){
 const row=fields(provided,['host','inventory','path']);
 const original=prepareLocalMetadataReconciliationInput({host:row['host'] as LocalMetadataReconciliationInput['host'],inventory:row['inventory'] as LocalMetadataReconciliationInput['inventory']});
 const host=row['path'] as SharedServerLogGenerationDeliveryPathRecoveryHost,port=generationDeliveryPathRecoveryHostPort(host);
 if(!port.handover||!equal(port.selection.current,original.port.selection))throw fail('local_metadata_assets_state');
 return Object.freeze({...original,handover:Object.freeze({host,port})});
}
export function admitMetadataHandoverCatalog(handover:MetadataHandover,catalog:PhysicalRoomCatalogV3Metadata):void{
 const port=generationDeliveryPathRecoveryHostPort(handover.host);
 if(!port.handover||!equal(port.handover,handover.port.handover))throw fail('local_metadata_assets_state');
 const origin=catalog.origin.identity,current=catalog.current.server.identity;
 if(!containsOrderedDeliveryCuts(handoverDeliveryCuts(port.handover.path),equal(origin,current)?[origin]:[origin,current]))throw fail('local_metadata_assets_state');
}
