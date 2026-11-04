/** Exact facts the original continuation can have durably written. Review
 * lanes advance separately; metadata records advance together in one CAS. */
import type {LocalReviewDeliverySnapshot} from '../selected_local_review_delivery/contract.js';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import {emptyRelay} from '../selected_local_review_delivery/policy.js';
import type {MetadataContinuationChoice} from './contract.js';
import {equal,fail} from './policy.js';
export function verifyContinuedReviewFacts(choice:MetadataContinuationChoice,original:LocalMetadataDeliverySnapshot,snapshot:LocalReviewDeliverySnapshot):void{
 for(const row of snapshot.current.lanes){const prior=original.current.lanes.find(p=>p.id===row.id),first=snapshot.before.lanes.find(p=>p.id===row.id);if(!prior||!first||!equal(first.source,row.source)||!equal(row.relay,emptyRelay(choice.review.lanes.find(p=>p.id===row.id)!.binding))&&!equal(row.relay,prior.relay))throw fail('metadata_continuation_destination_changed');}
}
export function verifyContinuedMetadataFacts(original:LocalMetadataDeliverySnapshot,review:LocalReviewDeliverySnapshot,snapshot:LocalMetadataDeliverySnapshot):void{
 for(const row of snapshot.before.lanes){const initial=original.before.lanes.find(p=>p.id===row.id),current=original.current.lanes.find(p=>p.id===row.id),native=review.before.lanes.find(p=>p.id===row.id);if(!initial||!current||!native||!equal(row.source,native.source)||!equal(row.relay,current.relay)||!equal(row.records,initial.records))throw fail('metadata_continuation_destination_changed');}
 const initial=original.before.lanes.map(row=>({id:row.id,records:row.records})),current=original.current.lanes.map(row=>({id:row.id,records:row.records})),actual=snapshot.current.lanes.map(row=>({id:row.id,records:row.records}));if(!equal(actual,initial)&&!equal(actual,current))throw fail('metadata_continuation_destination_changed');
}
