/** Distinct genuine current inventory; the original catalogue and its cached reader stay immutable. */
import {generationDeliveryRecoveryHostPort,type SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import type {PhysicalRoomCatalogV3Metadata} from '../physical_room_catalog_v3/contract.js';
import {SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';
const file=Inventory.prototype.file,metadata=Inventory.prototype.metadata,identity=Inventory.prototype.identity,owners=new WeakSet<object>();
const fail=()=>new SharedRoomParticipantInventoryError('inventory_source','Select the genuine complete previous/current native control and its exact live current inventory');
export function admitSelectedDeliveryInventory(host:SharedServerLogGenerationDeliveryRecoveryHost,reader:Inventory,catalog:PhysicalRoomCatalogV3Metadata){
 const port=generationDeliveryRecoveryHostPort(host),selection=port.selection,source=selection.continuation.current,held=file.call(reader),id=identity.call(reader),value=metadata.call(reader);
 if(JSON.stringify(source.origin)!==JSON.stringify(catalog.origin.identity)||JSON.stringify(selection.continuation.previous)!==JSON.stringify(catalog.current.server.identity)||JSON.stringify(id)!==JSON.stringify(source.participants))throw fail();
 const check=()=>{if(file.call(reader)!==held||identity.call(reader)!==id||metadata.call(reader)!==value)throw fail();};
 check();const admission=Object.freeze({port,selection,identity:id,metadata:value.native,check});owners.add(admission);return admission;
}
export type SelectedDeliveryInventory=ReturnType<typeof admitSelectedDeliveryInventory>;
export function checkSelectedDeliveryInventory(value:SelectedDeliveryInventory):void{if(!owners.has(value))throw fail();value.check();}
