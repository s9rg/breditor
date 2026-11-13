import {SharedRichEditor,reserveNativeRecovery} from '../core.js';
import {continuedCatalogInventory,SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import type {ContinuedRoomCatalogDeliveryEntry,ContinuedRoomCatalogPolicy} from '../continued_room_catalog/contract.js';
import {inspectLocalNativePrefix} from '../continued_participant/inventory.js';
import {withContinuedPairReplay} from '../continued_pair/replay.js';
import {ContinuedDeliveryCompanion} from '../continued_delivery/companion.js';
import {disposeOwnedCore} from '../owned_core_lifetime.js';
import {sourceCoreMethods} from '../source_native_read.js';
import type {SharedSelectionPolicy} from '../types.js';
import {reviewSource,sameReceipt} from '../relay/review_validation.js';
import type {SharedServerLogGenerationRecoveryAcceptedRead} from '../generation_recovery_control/accepted_contract.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';

const {participantDeliveryRecords}=SharedContinuedRoomCatalog.prototype;
const {retainedReviewReceipt,verifyRecoveryOrigin,verifySegmentedRecoveryOrigin}=SharedRichEditor.prototype;

/** Apply original accepted inputs to an isolated native replay of the exact
 * recovery. Own streams, receipts and pending packets remain local. */
export async function catchUpContinuedDeliveryClient(
 archive:SharedContinuedRoomCatalog,entry:ContinuedRoomCatalogDeliveryEntry,policy:ContinuedRoomCatalogPolicy,
 pages:readonly SharedServerLogGenerationRecoveryAcceptedRead[],check:()=>void,signal:AbortSignal,
){
 const {participant,principal,source:identity}=entry.selection.identity;
 const before=participantDeliveryRecords.call(archive,entry.id).live;
 const {document,review}=before.relay.binding;
 if(!review)throw fail('diverged');
 const inventory=continuedCatalogInventory(archive);
 const prefix=(core:SharedRichEditor<SharedSelectionPolicy>)=>
  inspectLocalNativePrefix(core,inventory,participant,principal,identity,check);
 return withContinuedPairReplay(identity,policy.restoreDocument,check,signal,async replay=>{
  const original=await replay(before.source,check);
  try{
   const previous=prefix(original);
   // The host cannot resolve a missing own authored suffix into a safe writer
   // handoff. That case requires independent reconciliation of the old writer.
   if(previous.documentStatus!=='matches'||previous.review.status!=='matches')throw fail('own_history');
   const candidate=await replay(before.source,check);
   try{
    const native=reserveNativeRecovery([candidate]);
    try{
     for(const page of pages){
      check();
      if(page.documentFrame!==null)native.receiveDocument(candidate,page.documentFrame);
      if(!page.review||page.review.descriptor.binding!==review.binding)throw fail('diverged');
      for(const batch of page.review.batches){
       check();
       const source=reviewSource(batch.source),imported=native.receiveReview(candidate,batch.frame,source);
       if((imported.kind!=='applied'&&imported.kind!=='unchanged')||
          !sameReceipt(retainedReviewReceipt.call(candidate,batch.frame,source),batch.receipt))throw fail('diverged');
      }
     }
    }finally{native.close();}
    const verify=identity.documentHistory==='original'?verifyRecoveryOrigin:verifySegmentedRecoveryOrigin;
    verify.call(candidate,original);
    const after=prefix(candidate);
    if(after.document.localThrough!==previous.document.localThrough||after.review.localThrough!==previous.review.localThrough||
       [...after.acceptedDocuments,...after.acceptedReviews].some(row=>row.relation==='server_ahead'))throw fail('diverged');
    const companion=new ContinuedDeliveryCompanion({database:'continued-room-catch-up-preview',...identity,readOnly:true,
     review:{...identity.review,access:'read_only'},restoreDocument:policy.restoreDocument,
     binding:{document,review},retained:before.retainedBinding},before);
    companion.admit(candidate);
    const readReview=identity.reviewHistory==='continued-v2'?sourceCoreMethods.reviewContinuedCheckpoint:
     identity.reviewHistory==='segmented-v1'?sourceCoreMethods.reviewSegmentedCheckpoint:sourceCoreMethods.reviewCheckpoint;
    const source={...before.source,documentCheckpoint:sourceCoreMethods.checkpointJson.call(candidate),
     reviewCheckpoint:readReview.call(candidate)};
    check();
    return {id:entry.id,prefix:after,recovery:companion.recovery(source)};
   }finally{disposeOwnedCore(candidate);}
  }finally{disposeOwnedCore(original);}
 });
}
