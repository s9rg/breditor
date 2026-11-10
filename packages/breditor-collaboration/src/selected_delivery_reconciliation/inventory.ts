/** Distinct genuine current inventory; the original catalogue and its cached reader stay immutable. */
import {generationDeliveryRecoveryHostPort,type SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import {generationDeliveryPathRecoveryHostPort,type SharedServerLogGenerationDeliveryPathRecoveryHost} from '../generation_delivery_path_control/host.js';
import {containsOrderedDeliveryCuts,handoverDeliveryCuts} from '../generation_delivery_path_control/retained_cuts.js';
import type {SharedServerLogGenerationDeliveryRecoveryControlSelection} from '../generation_delivery_control/contract.js';
import type {SelectedProviderPort} from '../selected_room_provider/projection.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import type {PhysicalRoomCatalogV3Metadata} from '../physical_room_catalog_v3/contract.js';
import {SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';
const file=Inventory.prototype.file,metadata=Inventory.prototype.metadata,identity=Inventory.prototype.identity,owners=new WeakSet<object>();
const fail=()=>new SharedRoomParticipantInventoryError('inventory_source','Select the genuine complete previous/current native control and its exact live current inventory');
export function admitSelectedDeliveryInventory(host:SharedServerLogGenerationDeliveryRecoveryHost,reader:Inventory,catalog:PhysicalRoomCatalogV3Metadata){
 const port=generationDeliveryRecoveryHostPort(host),selection=port.selection,source=selection.continuation.current;
 if(!equal(source.origin,catalog.origin.identity)||!equal(selection.continuation.previous,catalog.current.server.identity))throw fail();
 return admit(port,selection,reader);
}

const equal=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
export function admitSelectedHandoverDeliveryInventory(host:SharedServerLogGenerationDeliveryPathRecoveryHost,reader:Inventory,catalog:PhysicalRoomCatalogV3Metadata){
 const port=generationDeliveryPathRecoveryHostPort(host),handover=port.handover;
 if(!handover)throw fail();
 const origin=catalog.origin.identity,current=catalog.current.server.identity;
 const pins=equal(origin,current)?[origin]:[origin,current];
 if(!containsOrderedDeliveryCuts(handoverDeliveryCuts(handover.path),pins))throw fail();
 return admit(port,port.selection.current,reader);
}

function admit(port:SelectedProviderPort<SharedServerLogGenerationRecoveryAssetRead>,selection:SharedServerLogGenerationDeliveryRecoveryControlSelection,reader:Inventory){
 const held=file.call(reader),id=identity.call(reader),value=metadata.call(reader);
 if(!equal(id,selection.continuation.current.participants))throw fail();
 const check=()=>{if(file.call(reader)!==held||identity.call(reader)!==id||metadata.call(reader)!==value)throw fail();};
 check();const admission=Object.freeze({port,selection,identity:id,metadata:value.native,check});owners.add(admission);return admission;
}
export type SelectedDeliveryInventory=ReturnType<typeof admitSelectedDeliveryInventory>;
export function checkSelectedDeliveryInventory(value:SelectedDeliveryInventory):void{if(!owners.has(value))throw fail();value.check();}
