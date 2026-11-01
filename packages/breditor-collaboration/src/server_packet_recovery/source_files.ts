/** Closed immutable file selection. Hashes and recorded identities are DATA;
 * genuine host custody and complete Native equality are checked separately. */
import {archiveBlob} from '../archive_integrity/policy.js';
import {MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES as serverMaximum} from '../server_generation_archive/framing.js';
import {MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES as inventoryMaximum} from '../server_generation_inventory/policy.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import {serverGenerationParticipantIdentity} from '../server_generation_inventory/identity.js';
import {MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES as dependencyMaximum} from '../server_native_dependencies/contract.js';
import {fields,integer,hash} from '../physical_room_record_cut/policy.js';
import {metadataData} from '../selected_local_metadata_delivery/data.js';
import type {MetadataPacketFile} from '../metadata_packet_retention/contract.js';
import type {ServerPacketRecoveryBundle} from './contract.js';
import {fail} from '../metadata_packet_retention/policy.js';
export type ServerPacketSourceFiles=Pick<ServerPacketRecoveryBundle,'server'|'inventory'|'dependencies'>;
function selected(input:unknown,maximum:number):MetadataPacketFile{
 const r=fields(input,['file','bytes','sha256']),file=archiveBlob(r['file'] as Blob,maximum),bytes=integer(r['bytes'],maximum,1),sha256=hash(r['sha256']);if(file.size!==bytes)throw fail();return Object.freeze({file,bytes,sha256});
}
export function detachServerPacketSourceFiles(input:unknown):ServerPacketSourceFiles{
 const r=fields(input,['server','inventory','dependencies']),server=fields(r['server'],['file','bytes','sha256','identity']),inventory=fields(r['inventory'],['file','bytes','sha256','identity']);
 return Object.freeze({server:Object.freeze({...selected({file:server['file'],bytes:server['bytes'],sha256:server['sha256']},serverMaximum),identity:serverGenerationRoomIdentity(metadataData(server['identity']))}),inventory:Object.freeze({...selected({file:inventory['file'],bytes:inventory['bytes'],sha256:inventory['sha256']},inventoryMaximum),identity:serverGenerationParticipantIdentity(metadataData(inventory['identity']))}),dependencies:selected(r['dependencies'],dependencyMaximum)});
}
