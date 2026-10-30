/** Read literal portable reference bytes before interpreting JSON. Parsed rows
 * are only claims: the owner must regenerate the complete cut with native
 * aliases before returning any of them as inspected dependency data. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {LocalMetadataReferenceBundle} from './room_contract.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {fields,hash,integer} from '../physical_room_record_cut/policy.js';
import {detachLocalMetadataBundle} from '../selected_local_metadata_delivery/bundle.js';
import {MAX_LOCAL_METADATA_BYTES,metadataJson} from '../selected_local_metadata_delivery/data.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {fail} from './error.js';
export function detachLocalMetadataReferenceBundle(input:unknown):LocalMetadataReferenceBundle{
 const row=fields(input,['format','formatVersion','parent','references']);
 if(row['format']!=='breditor/selected-local-metadata-reference-bundle'||row['formatVersion']!==1)throw fail('local_metadata_assets_state');
 const file=fields(row['references'],['file','bytes','sha256']);
 return Object.freeze({format:'breditor/selected-local-metadata-reference-bundle',formatVersion:1,parent:detachLocalMetadataBundle(row['parent']),references:Object.freeze({file:archiveBlob(file['file'] as Blob,MAX_LOCAL_METADATA_BYTES),bytes:integer(file['bytes'],MAX_LOCAL_METADATA_BYTES,1),sha256:hash(file['sha256'])})});
}
/** Deliberately does not return typed points, references or a Ready decision. */
export async function readLocalMetadataReferenceClaims(bundle:LocalMetadataReferenceBundle,options:SharedArchiveIntegrityOptions,check:()=>void):Promise<{text:string;stored:unknown}>{
 check();const reference=bundle.references;if(reference.file.size!==reference.bytes)throw fail('local_metadata_assets_state');
 const integrity=prepareArchiveIntegrity(options);
 if(await integrity.digest(reference.file)!==reference.sha256)throw fail('local_metadata_assets_state');check();
 const text=await Blob.prototype.text.call(reference.file);check();
 if(await segmentedDigest(text)!==reference.sha256)throw fail('local_metadata_assets_state');check();
 const parsed:unknown=JSON.parse(text),row=fields(parsed,['format','formatVersion','scope','parent','stored','base','points','outcome']);
 if(row['format']!=='breditor/selected-local-metadata-reference-cut'||row['formatVersion']!==1||row['scope']!=='complete-base-history-and-before-stored-current-local-metadata'||metadataJson(parsed)!==text)throw fail('local_metadata_assets_state');
 return{text,stored:row['stored']};
}
