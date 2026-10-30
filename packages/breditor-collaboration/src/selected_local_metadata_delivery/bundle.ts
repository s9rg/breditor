/** Detach the literal original multipart slots before awaits. No decoded DATA
 * value selects an actual source, metadata owner, socket or serving right. */
import {fields,hash,integer} from '../physical_room_record_cut/policy.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {detachLocalReviewBundle} from '../selected_local_review_delivery/bundle.js';
import {MAX_LOCAL_METADATA_BYTES} from './data.js';
import {fail} from './error.js';
import type {LocalMetadataRoomBundle} from './contract.js';
export function detachLocalMetadataBundle(input:unknown):LocalMetadataRoomBundle{
 const r=fields(input,['format','formatVersion','parent','metadata']);if(r['format']!=='breditor/selected-local-metadata-room-bundle'||r['formatVersion']!==1)throw fail();const m=fields(r['metadata'],['file','bytes','sha256']);
 return Object.freeze({format:'breditor/selected-local-metadata-room-bundle',formatVersion:1,parent:detachLocalReviewBundle(r['parent']),metadata:Object.freeze({file:archiveBlob(m['file'] as Blob,MAX_LOCAL_METADATA_BYTES),bytes:integer(m['bytes'],MAX_LOCAL_METADATA_BYTES,1),sha256:hash(m['sha256'])})});
}
