/** Full native continuation plus exact original metadata. Counters, matching
 * rendered text and a common descendant cannot replace this pairwise replay. */
import {verifyLocalReviewSnapshotContinuation} from '../selected_local_review_delivery/continuation.js';
import {admitLocalReviewRoomSource} from '../selected_local_review_delivery/bundle_native.js';
import {admitDeliveryRetainedRecords} from '../delivery_state/retained.js';
import type {LocalReviewMetadataParent} from '../selected_local_review_delivery/metadata_parent.js';
import type {LocalReviewDeliveryState,LocalReviewDeliverySnapshot} from '../selected_local_review_delivery/contract.js';
import type {LocalMetadataDeliverySnapshot,LocalMetadataRoomBundle} from './contract.js';
import {equal,fail} from './policy.js';
import {requireMetadataRecordsForward} from './forward.js';
export function requireMetadataSnapshotForward(before:LocalMetadataDeliverySnapshot,after:LocalMetadataDeliverySnapshot):void{
 if(!equal(before.before,after.before)||!equal(before.current.choice,after.current.choice)||after.current.revision<before.current.revision||after.current.revision===before.current.revision&&!equal(before.current,after.current)||before.current.lanes.length!==after.current.lanes.length)throw fail();
 for(let i=0;i<before.current.lanes.length;i++){const a=before.current.lanes[i]!,b=after.current.lanes[i]!;if(a.id!==b.id||!equal(a.source.identity,b.source.identity)||a.source.versions.length>b.source.versions.length||a.source.versions.some((packet,j)=>packet!==b.source.versions[j]))throw fail();requireMetadataRecordsForward(a.records,b.records);}
}
function nativeState(s:LocalMetadataDeliverySnapshot['current']):LocalReviewDeliveryState{return{format:'breditor/selected-local-review-delivery-state',formatVersion:1,choice:s.choice.parent,revision:s.revision,lanes:s.lanes.map(({id,source,relay})=>({id,source,relay}))};}
function nativeSnapshot(s:LocalMetadataDeliverySnapshot):LocalReviewDeliverySnapshot{return{before:nativeState(s.before),current:nativeState(s.current)};}
function packets(state:LocalMetadataDeliverySnapshot['current']){return new Map(state.lanes.map(lane=>{const binding=state.choice.lanes.find(row=>row.id===lane.id)!.binding;return[lane.id,{binding,records:lane.records}] as const;}));}
export async function admitMetadataContinuation(parent:LocalReviewMetadataParent,bundle:LocalMetadataRoomBundle,portable:LocalMetadataDeliverySnapshot,stored:LocalMetadataDeliverySnapshot,check:()=>void):Promise<void>{
 check();requireMetadataSnapshotForward(portable,stored);if(!equal(parent.choice,stored.current.choice.parent))throw fail();
 // The immutable initial native cut itself must contain its packets and precede
 // the exported current cut. A common live descendant is insufficient proof.
 const initial={before:nativeState(portable.before),current:nativeState(portable.before)};
 await verifyLocalReviewSnapshotContinuation(parent.scope,bundle.parent.current,initial,nativeSnapshot(portable),check);check();
 await admitLocalReviewRoomSource(parent.scope,bundle.parent.current.file,bundle.parent.current.selection,nativeState(portable.before),check,false,packets(portable.before));check();
 await admitLocalReviewRoomSource(parent.scope,bundle.parent.current.file,bundle.parent.current.selection,nativeState(portable.current),check,false,packets(portable.current));check();
 // Full native envelopes, versions, receipts AND packets have already been
 // proved if every current lane byte agrees. Only the checkpoint counter may
 // advance in this case. Every changed state requires its own pairwise replay.
 if(!equal(portable.current.lanes,stored.current.lanes)){
  await verifyLocalReviewSnapshotContinuation(parent.scope,bundle.parent.current,nativeSnapshot(portable),nativeSnapshot(stored),check);check();
  await admitLocalReviewRoomSource(parent.scope,bundle.parent.current.file,bundle.parent.current.selection,nativeState(stored.current),check,false,packets(stored.current));check();
 }
 for(const lane of stored.current.lanes){const source=parent.sources.find(row=>row.id===lane.id);if(!source||source.source.parent.kind!=='independent-local')throw fail();const binding=stored.current.choice.lanes.find(row=>row.id===lane.id)!.binding;admitDeliveryRetainedRecords(source.source.core,binding,lane.records);check();}
}
