/** Canonical cached inventory and its actual file lifetime. Authentication of
 * the same independently pinned cut remains the separate real operator read. */
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import type {PhysicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import {SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';
const file=Inventory.prototype.file,metadata=Inventory.prototype.metadata,identity=Inventory.prototype.identity;
const fail=()=>new SharedRoomParticipantInventoryError('inventory_source','The actual retained inventory differs from the independently selected catalog cut');
export function selectedInventoryCut(source:PhysicalCatalogV3ArchiveState){
 const owner=source.inventory,held=file.call(owner),selected=identity.call(owner),value=metadata.call(owner);
 if(JSON.stringify(selected)!==JSON.stringify(source.metadata.current.participants.identity))throw fail();
 const check=()=>{if(file.call(owner)!==held||identity.call(owner)!==selected||metadata.call(owner)!==value)throw fail();};
 check();const result=Object.freeze({metadata:value.native,check});check();return result;
}
