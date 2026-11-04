/** Detach the complete old DATA record and own its UTF-8 bytes before any
 * asynchronous validation or application-supplied hashing/authority callback. */
import {jointReassociationPriorMetadataList} from '../native_room_joint_reassociation/identity.js';
import {MAX_PINNED_METADATA_SNAPSHOT_BYTES,metadataPinsFailure as fail} from './policy.js';
import type {MetadataContinuationEvidencePins} from './contract.js';
export interface PreparedMetadataPinCapture {
 readonly choice:MetadataContinuationEvidencePins['choice'];readonly phase:MetadataContinuationEvidencePins['phase'];
 readonly review:Blob|null;readonly metadata:Blob|null;
 readonly reviewText:string|null;readonly metadataText:string|null;
}
export function prepareMetadataPinCapture(provided:unknown):PreparedMetadataPinCapture{
 const evidence=jointReassociationPriorMetadataList([provided])[0];if(!evidence||evidence.format!=='breditor/metadata-continuation-evidence')throw fail();
 const review=evidence.review===null?null:Object.freeze(new Blob([evidence.review],{type:'application/json'})),metadata=evidence.metadata===null?null:Object.freeze(new Blob([evidence.metadata],{type:'application/json'}));
 if((review?.size??0)+(metadata?.size??0)>MAX_PINNED_METADATA_SNAPSHOT_BYTES)throw fail();
 return Object.freeze({choice:evidence.choice,phase:evidence.phase,review,metadata,reviewText:evidence.review,metadataText:evidence.metadata});
}
