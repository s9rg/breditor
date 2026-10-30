/** Detach the literal closed multi-file envelope only after the owner has
 * registered the actual task. No part of the envelope grants source custody. */
import {archiveBlob} from '../archive_integrity/policy.js';
import {MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES} from '../server_generation_archive/framing.js';
import {MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES} from '../server_generation_inventory/policy.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import {serverGenerationParticipantIdentity} from '../server_generation_inventory/identity.js';
import {fields,hash,integer} from '../physical_room_record_cut/policy.js';
import {metadataData} from '../selected_local_metadata_delivery/data.js';
import {detachLocalMetadataRecoverableBundle} from './recoverable_bundle.js';
import type {LocalMetadataRecoveryBytesBundle} from './recovery_bytes_contract.js';
import {fail} from './error.js';
export function detachLocalMetadataRecoveryBytesBundle(input:unknown):LocalMetadataRecoveryBytesBundle{
 const row=fields(input,['format','formatVersion','scope','recoverable','server','inventory']);if(row['format']!=='breditor/selected-local-metadata-recovery-bytes-bundle'||row['formatVersion']!==1||row['scope']!=='complete-client-metadata-assets-and-selected-server-files')throw fail('local_metadata_assets_state');
 const server=fields(row['server'],['file','bytes','sha256','identity']),inventory=fields(row['inventory'],['file','bytes','sha256','identity']);
 return Object.freeze({format:'breditor/selected-local-metadata-recovery-bytes-bundle',formatVersion:1,scope:'complete-client-metadata-assets-and-selected-server-files',recoverable:detachLocalMetadataRecoverableBundle(row['recoverable']),server:Object.freeze({file:archiveBlob(server['file'] as Blob,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES),bytes:integer(server['bytes'],MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES,1),sha256:hash(server['sha256']),identity:serverGenerationRoomIdentity(metadataData(server['identity']))}),inventory:Object.freeze({file:archiveBlob(inventory['file'] as Blob,MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES),bytes:integer(inventory['bytes'],MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES,1),sha256:hash(inventory['sha256']),identity:serverGenerationParticipantIdentity(metadataData(inventory['identity']))})});
}
