/** Reconstruct exact original DATA only after independent pin selection, native
 * length/digest verification and canonical original binding validation. A
 * successful read never supplies a live journal, custody or serving permission. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES} from '../archive_integrity/policy.js';
import type {MetadataContinuationEvidence} from '../selected_local_metadata_continuation/evidence_contract.js';
import {metadataContinuationEvidencePins} from './identity.js';
import {prepareMetadataPinArchive} from './prepare_archive.js';
import {validateMetadataPinCapture} from './validate_capture.js';
import {metadataPinsFailure as fail} from './policy.js';
import type {MetadataContinuationEvidencePins,MetadataSnapshotPin} from './contract.js';
async function read(file:Blob|null,pin:MetadataSnapshotPin|null,integrity:ArchiveIntegrityContext):Promise<string|null>{
 if(file===null||pin===null){if(file!==null||pin!==null)throw fail();return null;}
 if(await integrity.digest(file)!==pin.sha256)throw fail('metadata_pins_stale');integrity.guard();
 const bytes=new Uint8Array(file.size);
 for(let offset=0;offset<file.size;offset+=MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES){bytes.set(await integrity.read(file,offset,Math.min(MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES,file.size-offset)),offset);integrity.guard();}
 try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw fail();}
}
export async function readMetadataContinuationPinArchive(provided:unknown,expected:MetadataContinuationEvidencePins,options:SharedArchiveIntegrityOptions):Promise<MetadataContinuationEvidence>{
 const selected=metadataContinuationEvidencePins(expected),archive=prepareMetadataPinArchive(provided);
 if(JSON.stringify(selected)!==JSON.stringify(archive.pins))throw fail('metadata_pins_stale');
 const integrity=prepareArchiveIntegrity(options),reviewText=await read(archive.review,selected.review,integrity);integrity.guard();
 const metadataText=await read(archive.metadata,selected.metadata,integrity);integrity.guard();
 await validateMetadataPinCapture({choice:selected.choice,phase:selected.phase,review:archive.review,metadata:archive.metadata,reviewText,metadataText});integrity.guard();
 return Object.freeze({format:'breditor/metadata-continuation-evidence',formatVersion:1,choice:selected.choice,phase:selected.phase,review:reviewText,metadata:metadataText});
}
