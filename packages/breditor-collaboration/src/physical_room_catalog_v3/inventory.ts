/** Canonical genuine physical inventory methods fence one synchronous extended
 * diagnostic. Metadata copies and a closed owner cannot supply this boundary. */
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import {checkPhysicalCatalogV3Cohort,type PhysicalCatalogV3CohortSource} from './coverage.js';
import {SharedRoomParticipantInventoryError} from '../room_participant_inventory/policy.js';
const file=Inventory.prototype.file,metadata=Inventory.prototype.metadata,identity=Inventory.prototype.identity;
export function checkPhysicalCatalogV3Inventory(owner:Inventory,input:readonly PhysicalCatalogV3CohortSource[]){
 const held=file.call(owner),selected=identity.call(owner),coverage=checkPhysicalCatalogV3Cohort(metadata.call(owner).native,input),result=Object.freeze({source:selected.source,coverage});
 if(file.call(owner)!==held)throw new SharedRoomParticipantInventoryError('inventory_source','Physical inventory retired during native read');
 // Preparing the wrapper may invoke an instrumented freeze; repeat native
 // source checks afterwards rather than returning stale prefix evidence.
 checkPhysicalCatalogV3Cohort(metadata.call(owner).native,input);if(file.call(owner)!==held)throw new SharedRoomParticipantInventoryError('inventory_source','Physical inventory retired during native read');
 return result;
}
