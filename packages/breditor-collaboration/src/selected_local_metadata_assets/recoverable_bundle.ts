/** Closed V2 union envelope, detached only after the real operation registers
 * its busy slot. An older V1 materialized bundle cannot be relabeled. */
import {archiveBlob,MAX_SHARED_ARCHIVE_DIGEST_BYTES} from '../archive_integrity/policy.js';
import {fields,hash,integer} from '../physical_room_record_cut/policy.js';
import {detachLocalMetadataReferenceBundle} from './portable_bundle.js';
import type {LocalMetadataRecoverableBundle} from './recoverable_contract.js';
import {fail} from './error.js';
export function detachLocalMetadataRecoverableBundle(input:unknown):LocalMetadataRecoverableBundle{
 const row=fields(input,['format','formatVersion','references','rasters']);if(row['format']!=='breditor/selected-local-metadata-recoverable-bundle'||row['formatVersion']!==1)throw fail('local_metadata_assets_state');
 const rasters=fields(row['rasters'],['file','bytes','sha256']);return Object.freeze({format:'breditor/selected-local-metadata-recoverable-bundle',formatVersion:1,references:detachLocalMetadataReferenceBundle(row['references']),rasters:Object.freeze({file:archiveBlob(rasters['file'] as Blob,MAX_SHARED_ARCHIVE_DIGEST_BYTES),bytes:integer(rasters['bytes'],MAX_SHARED_ARCHIVE_DIGEST_BYTES,1),sha256:hash(rasters['sha256'])})});
}
