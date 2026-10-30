/** Detach the literal closed envelope before async work. Blob detachment may
 * call an application type getter, so the genuine owner must register its
 * busy slot and actual pending task before calling this function. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {archiveBlob,MAX_SHARED_ARCHIVE_DIGEST_BYTES} from '../archive_integrity/policy.js';
import {fields,hash,integer} from '../physical_room_record_cut/policy.js';
import {metadataData} from '../selected_local_metadata_delivery/data.js';
import {detachLocalMetadataReferenceBundle} from './portable_bundle.js';
import type {LocalMetadataMaterializedBundle,LocalMetadataMaterializationOptions} from './materialization_contract.js';
import {fail} from './error.js';
export function detachLocalMetadataMaterializedBundle(input:unknown):LocalMetadataMaterializedBundle{
 const row=fields(input,['format','formatVersion','references','rasters']);
 if(row['format']!=='breditor/selected-local-metadata-materialized-bundle'||row['formatVersion']!==1)throw fail('local_metadata_assets_state');
 const rasters=fields(row['rasters'],['file','bytes','sha256']);
 return Object.freeze({format:'breditor/selected-local-metadata-materialized-bundle',formatVersion:1,references:detachLocalMetadataReferenceBundle(row['references']),rasters:Object.freeze({file:archiveBlob(rasters['file'] as Blob,MAX_SHARED_ARCHIVE_DIGEST_BYTES),bytes:integer(rasters['bytes'],MAX_SHARED_ARCHIVE_DIGEST_BYTES,1),sha256:hash(rasters['sha256'])})});
}
export function localMetadataMaterializationLimits(input:LocalMetadataMaterializationOptions){
 const row=fields(input,[],['limits']);return checkRichAssetLimits(row['limits']===undefined?{}:metadataData(row['limits']) as LocalMetadataMaterializationOptions['limits']);
}
