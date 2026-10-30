/** Reprove local review affiliation using a genuine owner's admitted current
 * records and actual native prefix reads. Never promote a saved actor alone. */
import {SharedRichEditor} from '../core.js';
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import type {PreparedLocalMetadataReconciliation} from './reconciliation_input.js';
import type {LocalMetadataReconciledReview,LocalMetadataReconciliationPending} from './reconciliation_contract.js';
import {verifyLocalReviewProgress} from '../selected_local_review_delivery/native_review.js';
import {fail} from './error.js';
import {MAX_SELECTED_GENERATION_HEAD_REQUIREMENTS} from '../selected_room_reconciliation/generation_heads.js';
const clock=SharedRichEditor.prototype.reviewWriterClock;
export function localMetadataReconciledReviews(sources:readonly RetainedDeliveryClient[],snapshot:LocalMetadataDeliverySnapshot,input:PreparedLocalMetadataReconciliation,check:()=>void){
 const reviews:LocalMetadataReconciledReview[]=[],pending:LocalMetadataReconciliationPending[]=[],actors=new Set<string>();
 const add=(row:LocalMetadataReconciliationPending)=>{if(pending.length>=MAX_SELECTED_GENERATION_HEAD_REQUIREMENTS)throw fail('local_metadata_assets_reference_budget');pending.push(row);};
 for(const lane of snapshot.current.lanes){
  check();const row=sources.find(value=>value.id===lane.id),chosen=snapshot.current.choice.parent.lanes.find(value=>value.id===lane.id),binding=lane.relay.binding.review;
  if(!row||row.source.parent.kind!=='independent-local'||!chosen||!binding||actors.has(binding.actor)||binding.binding!==input.metadata.review?.binding||binding.actor!==chosen.binding.actor||binding.principal!==chosen.binding.principal||binding.documentWriter!==chosen.binding.documentWriter||binding.room!==input.metadata.room.document)throw fail('local_metadata_assets_state');
  actors.add(binding.actor);
  const registration=input.metadata.review.writers.find(value=>value.clock.actor===binding.actor);
  if(!registration||registration.principal!==binding.principal)throw fail('local_metadata_assets_state');
  verifyLocalReviewProgress(row.source.core,lane.relay);
  const heads=input.metadata.review.writers.map((author,index)=>{
   const accepted=author.clock,local=clock.call(row.source.core,accepted.actor,author.principal);
   if(BigInt(local.through)>=BigInt(accepted.through)){
    const prefix=clock.call(row.source.core,accepted.actor,author.principal,accepted.through);
    if(prefix.through!==accepted.through||prefix.prefixDigest!==accepted.prefixDigest)throw fail('local_metadata_assets_state');
   }
   if(local.through!==accepted.through)add({kind:'head',requirement:{participant:row.id,lane:'review',authorIndex:index,relation:BigInt(local.through)<BigInt(accepted.through)?'server-ahead':'local-ahead',localThrough:local.through,acceptedThrough:accepted.through}});
   return local.through;
  });
  const accepted=lane.relay.review?.accepted??null,receiptVerified=lane.relay.reviewReceipt!==null;
  if(!accepted||accepted.through!==registration.clock.through||accepted.prefixDigest!==registration.clock.prefixDigest||(accepted.through!=='0'&&!receiptVerified))add({kind:'review-progress',participant:row.id});
  reviews.push({participant:row.id,actor:binding.actor,binding:binding.binding,heads,acceptedThrough:accepted?.through??null,receiptVerified});check();
 }
 if(reviews.length!==sources.filter(row=>row.source.parent.kind==='independent-local').length)throw fail('local_metadata_assets_state');
 return {reviews,pending};
}
