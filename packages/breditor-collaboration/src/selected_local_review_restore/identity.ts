/** Closed nonsecret restore decision. No source-family or database name is
 * relabelled; an existing namespace must have the exact selected original bytes. */
import {fields,integer,hash} from '../physical_room_record_cut/policy.js';
import {preparationChoice} from '../selected_delivery_preparation/identity.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {deliveryPathControlSelection} from '../generation_delivery_path_control/identity.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {localChoice,equal,MAX_LOCAL_REVIEW_BYTES,fail} from '../selected_local_review_delivery/policy.js';
import type {LocalReviewRestoreChoice,LocalReviewRestoreDestinations,LocalReviewRestorePresence} from './contract.js';
function presence(value:unknown):LocalReviewRestorePresence{if(value!=='absent'&&value!=='identical')throw fail('local_review_restore_policy');return value;}
export function restoreDestinations(input:unknown):LocalReviewRestoreDestinations{const r=fields(input,['prepared','delivery']);return frozen({prepared:presence(r['prepared']),delivery:presence(r['delivery'])});}
export function localReviewRestoreChoice(input:unknown):LocalReviewRestoreChoice{
 const r=fields(input,['format','formatVersion','prepared','delivery','bundle','destinations','current','path']),b=fields(r['bundle'],['current','bytes','sha256']);if(r['format']!=='breditor/selected-local-review-data-restore'||r['formatVersion']!==1)throw fail('local_review_restore_policy');
 const prepared=preparationChoice(r['prepared']),delivery=localChoice(r['delivery']);if(prepared.database===delivery.database||!equal(prepared.before,delivery.before))throw fail('local_review_restore_policy');
 return frozen({format:'breditor/selected-local-review-data-restore',formatVersion:1,prepared,delivery,bundle:{current:selectedRoomCurrentSelection(b['current']),bytes:integer(b['bytes'],MAX_LOCAL_REVIEW_BYTES,1),sha256:hash(b['sha256'])},destinations:restoreDestinations(r['destinations']),current:selectedRoomCurrentSelection(r['current']),path:deliveryPathControlSelection(r['path'])});
}
