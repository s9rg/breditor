/** Pin the original bundle and stored revision to the actual sealed handover. */
import {fields} from '../physical_room_record_cut/policy.js';
import {handoverDeliveryPathSelection} from '../generation_delivery_path_control/handover.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {localReviewResumeChoice} from './resume_identity.js';
import type {LocalReviewHandoverResumeChoice} from './handover_contract.js';
import {fail} from './policy.js';

export function localReviewHandoverResumeChoice(input:unknown):LocalReviewHandoverResumeChoice {
 const row=fields(input,['format','formatVersion','delivery','bundle','stored','current','path']);
 if(row['format']!=='breditor/selected-local-review-handover-resume')throw fail('local_review_delivery_policy');
 const path=handoverDeliveryPathSelection(row['path']);
 const original=localReviewResumeChoice({...row,format:'breditor/selected-local-review-delivery-resume',path:path.current});
 return frozen({...original,format:'breditor/selected-local-review-handover-resume',path});
}
