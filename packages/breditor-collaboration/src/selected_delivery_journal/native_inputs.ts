/** Capture actual reader brands/intrinsics before callbacks; disposal remains observable. */
import {SharedServerLogGenerationRoomArchive as Server} from '../server_generation_archive/read.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import {fail} from './policy.js';
const serverFile=Server.prototype.file,serverIdentity=Server.prototype.identity,inventoryFile=Inventory.prototype.file,inventoryIdentity=Inventory.prototype.identity;
export function journalNativeInputs(server:Server,inventory:Inventory){const native=serverFile.call(server),source=serverIdentity.call(server),participants=inventoryFile.call(inventory),selected=inventoryIdentity.call(inventory);if(JSON.stringify(selected.source)!==JSON.stringify(source.native))throw fail('delivery_journal_policy');const check=()=>{if(serverFile.call(server)!==native||serverIdentity.call(server)!==source||inventoryFile.call(inventory)!==participants||inventoryIdentity.call(inventory)!==selected)throw fail('delivery_journal_closed');};check();return Object.freeze({server:native,inventory:participants,source,participants:selected,reader:inventory,check});}
