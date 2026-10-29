/** Pin the complete actual stored head in each fresh resume decision. */
import {fields,integer,hash} from '../physical_room_record_cut/policy.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {deliveryPathControlSelection} from '../generation_delivery_path_control/identity.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {localChoice,fail,MAX_LOCAL_REVIEW_BYTES} from './policy.js';
import type {LocalReviewResumeChoice,LocalReviewStoredSelection} from './resume_contract.js';
export function localReviewStoredSelection(input:unknown):LocalReviewStoredSelection{const r=fields(input,['revision','bytes','sha256']);return frozen({revision:integer(r['revision'],Number.MAX_SAFE_INTEGER),bytes:integer(r['bytes'],MAX_LOCAL_REVIEW_BYTES,1),sha256:hash(r['sha256'])});}
export function localReviewResumeChoice(input:unknown):LocalReviewResumeChoice{const r=fields(input,['format','formatVersion','delivery','bundle','stored','current','path']),b=fields(r['bundle'],['current','bytes','sha256']);if(r['format']!=='breditor/selected-local-review-delivery-resume'||r['formatVersion']!==1)throw fail('local_review_delivery_policy');return frozen({format:'breditor/selected-local-review-delivery-resume',formatVersion:1,delivery:localChoice(r['delivery']),bundle:{current:selectedRoomCurrentSelection(b['current']),bytes:integer(b['bytes'],MAX_LOCAL_REVIEW_BYTES,1),sha256:hash(b['sha256'])},stored:localReviewStoredSelection(r['stored']),current:selectedRoomCurrentSelection(r['current']),path:deliveryPathControlSelection(r['path'])});}
