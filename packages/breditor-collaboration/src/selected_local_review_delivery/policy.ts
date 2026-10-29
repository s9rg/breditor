/** Closed bounded original metadata. Native replay and authentication are separate. */
import {fields,integer,rows} from '../physical_room_record_cut/policy.js';
import {database,identifier} from '../physical_room_asset_adoption/policy.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import {canonicalIndependentHistoryIdentity} from '../independent_history/cut.js';
import {independentRecords,checkIndependentRecords} from '../independent_source/records.js';
import {reviewStorageIdentity} from '../relay/review_validation.js';
import {relayBinding,relayProgress,initialRelayProgress,forwardProgress} from '../segmented_relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {LocalReviewDeliveryChoice,LocalReviewDeliveryState,LocalReviewDeliverySnapshot} from './contract.js';
import type {SharedReviewRelayStorageIdentity} from '../relay/review_types.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
export const MAX_LOCAL_REVIEW_BYTES=1024*1024*1024;
export const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
import {fail} from './error.js';
export {LocalReviewDeliveryError,fail} from './error.js';
export function localBinding(input:unknown):SharedReviewRelayStorageIdentity{
 const r=fields(input,['endpoint','principal','room','actor','binding','documentWriter'],['writerTransport','reviewEditing']);
 const result=reviewStorageIdentity(r as unknown as SharedReviewRelayStorageIdentity);if(result.reviewEditing)throw fail('local_review_delivery_policy');return frozen(result);
}
export function emptyRelay(input:SharedReviewRelayStorageIdentity){return initialRelayProgress(relayBinding({document:{endpoint:input.endpoint,principal:input.principal,room:input.room,writer:input.documentWriter,...(input.writerTransport?{writerTransport:input.writerTransport}:{})},review:input}));}
export function localChoice(input:unknown):LocalReviewDeliveryChoice{
 const r=fields(input,['format','formatVersion','database','before','lanes']);if(r['format']!=='breditor/selected-local-review-delivery'||r['formatVersion']!==1)throw fail('local_review_delivery_policy');let previous='';
 const lanes=rows(r['lanes'],1024).map(value=>{const row=fields(value,['id','family','source','binding']),id=identifier(row['id']),family=row['family'],source=canonicalIndependentHistoryIdentity(row['source'] as LocalReviewDeliveryChoice['lanes'][number]['source']),binding=localBinding(row['binding']);
  if(id<=previous||!['independent-local','local-operation-snapshot','local-operation-flat'].includes(String(family))||binding.room!==source.native.room||binding.documentWriter!==source.native.writer||binding.actor!==source.review.actor||binding.principal!==source.review.principal)throw fail();previous=id;return{id,family:family as LocalReviewDeliveryChoice['lanes'][number]['family'],source,binding};
 });if(!lanes.length)throw fail('local_review_delivery_policy');return frozen({format:'breditor/selected-local-review-delivery',formatVersion:1,database:database(r['database']),before:selectedRoomCurrentSelection(r['before']),lanes});
}
export async function localState(input:unknown,expected:LocalReviewDeliveryChoice):Promise<LocalReviewDeliveryState>{
 const r=fields(input,['format','formatVersion','choice','revision','lanes']);if(r['format']!=='breditor/selected-local-review-delivery-state'||r['formatVersion']!==1||!equal(localChoice(r['choice']),expected))throw fail();
 const lanes=[];for(const [i,value]of rows(r['lanes'],1024).entries()){
  const row=fields(value,['id','source','relay']),choice=expected.lanes[i];if(!choice||row['id']!==choice.id)throw fail();const src=fields(row['source'],['format','formatVersion','identity','documentCheckpoint','reviewCheckpoint','versions']);
  if(src['format']!=='breditor/shared-independent-history-recovery'||src['formatVersion']!==1||!equal(canonicalIndependentHistoryIdentity(src['identity'] as SharedIndependentHistoryRecovery['identity']),choice.source))throw fail();
  const source=await checkIndependentRecords(choice.source,independentRecords(src as unknown as SharedIndependentHistoryRecovery)),relay=relayProgress(row['relay'],emptyRelay(choice.binding).binding);
  if(relay.document.accepted!==null||relay.document.receipt!==null)throw fail();lanes.push({id:choice.id,source,relay});
 }if(lanes.length!==expected.lanes.length)throw fail();return frozen({format:'breditor/selected-local-review-delivery-state',formatVersion:1,choice:expected,revision:integer(r['revision'],Number.MAX_SAFE_INTEGER),lanes});
}
export async function localSnapshot(input:unknown,choice:LocalReviewDeliveryChoice):Promise<LocalReviewDeliverySnapshot>{
 const r=fields(input,['before','current']),before=await localState(r['before'],choice),current=await localState(r['current'],choice);if(before.revision!==0)throw fail();
 for(let i=0;i<before.lanes.length;i++){if(!equal(before.lanes[i]!.relay,emptyRelay(choice.lanes[i]!.binding)))throw fail();forwardProgress(before.lanes[i]!.relay,current.lanes[i]!.relay);}
 return frozen({before,current});
}
export function localJson(value:unknown):string{const text=JSON.stringify(value);if(new TextEncoder().encode(text).length>MAX_LOCAL_REVIEW_BYTES)throw fail('local_review_delivery_budget');return text;}
