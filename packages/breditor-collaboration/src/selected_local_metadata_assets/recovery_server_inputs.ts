/** Capture genuine reader intrinsics before callbacks. A DTO or public method
 * shadow cannot supply selected Native server/inventory bytes or lifetime. */
import {SharedServerLogGenerationRoomArchive as Server} from '../server_generation_archive/read.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../server_generation_inventory/read.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES} from '../server_generation_archive/framing.js';
import {MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES} from '../server_generation_inventory/policy.js';
import type {LocalMetadataAssetAvailabilityRead} from './availability_contract.js';
import {equal} from '../selected_local_metadata_delivery/data.js';
import {fail} from './error.js';
const server={file:Server.prototype.file,identity:Server.prototype.identity},inventory={file:Inventory.prototype.file,identity:Inventory.prototype.identity};
/** Selection DATA only. Actual capture obtains it from a genuine live host;
 * offline inspection obtains it from an already checked historical record. */
export function recoveryBytesServerSelection(control:LocalMetadataAssetAvailabilityRead['control']){return control.kind==='source'?control.selection.source:control.selection.current.source;}
export function prepareRecoveryServerInputs(selectedServer:Server,selectedInventory:Inventory,control:LocalMetadataAssetAvailabilityRead['control']){
 const originalServer=server.file.call(selectedServer),identity=server.identity.call(selectedServer),originalInventory=inventory.file.call(selectedInventory),participants=inventory.identity.call(selectedInventory),current=recoveryBytesServerSelection(control);
 if(!equal(identity,current.server)||!equal(participants,current.participants)||!equal(participants.source,identity.native))throw fail('local_metadata_assets_state');
 const check=()=>{if(server.file.call(selectedServer)!==originalServer||server.identity.call(selectedServer)!==identity||inventory.file.call(selectedInventory)!==originalInventory||inventory.identity.call(selectedInventory)!==participants)throw fail('local_metadata_assets_closed');};
 check();const files={server:archiveBlob(originalServer,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES),inventory:archiveBlob(originalInventory,MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES)};check();
 return Object.freeze({...files,identity,participants,check});
}
export type PreparedRecoveryServerInputs=ReturnType<typeof prepareRecoveryServerInputs>;
