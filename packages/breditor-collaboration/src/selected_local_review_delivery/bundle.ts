/** Detach every multipart slot before callbacks/awaits. The old room file is
 * deliberately not itself the complete new-layer export. No credentials exist here. */
import {fields,integer,hash} from '../physical_room_record_cut/policy.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {selectedRoomCurrentSelection,MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {preparationChoice} from '../selected_delivery_preparation/identity.js';
import {MAX_LOCAL_REVIEW_BYTES,fail} from './policy.js';
import type {LocalReviewRoomBundle} from './contract.js';
export function detachLocalReviewBundle(input:unknown):LocalReviewRoomBundle{
 const r=fields(input,['format','formatVersion','prepared','current','delivery']);if(r['format']!=='breditor/selected-local-review-room-bundle'||r['formatVersion']!==1)throw fail();
 const p=fields(r['prepared'],['choice','file']),c=fields(r['current'],['selection','file']),d=fields(r['delivery'],['file','bytes','sha256']);
 return Object.freeze({format:'breditor/selected-local-review-room-bundle',formatVersion:1,prepared:Object.freeze({choice:preparationChoice(p['choice']),file:archiveBlob(p['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)}),current:Object.freeze({selection:selectedRoomCurrentSelection(c['selection']),file:archiveBlob(c['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)}),delivery:Object.freeze({file:archiveBlob(d['file'] as Blob,MAX_LOCAL_REVIEW_BYTES),bytes:integer(d['bytes'],MAX_LOCAL_REVIEW_BYTES,1),sha256:hash(d['sha256'])})});
}
