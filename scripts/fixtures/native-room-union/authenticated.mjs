/** Actual complete room owners and a separate live native server. Only storage/locks/raster are controlled. */
import assert from 'node:assert/strict';
import {roomUnionFixture} from './session.mjs';
import {replaceRoomRecords} from './fork.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../../../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {SharedRichEditor} from '../../../packages/breditor-collaboration/dist/index.js';
import {SharedPhysicalRoomRecoveryHost as Host,physicalRecoveryHostPort} from '../../../packages/breditor-collaboration/dist/physical_recovery_control/host.js';
import {reviewSource,sameReceipt} from '../../../packages/breditor-collaboration/dist/relay/review_validation.js';
export async function authenticatedRoomUnionFixture(fixtures,options={}){
 const item=options.item??fixtures.manifest.cases.at(-1);let f,host,allowed=true,onToken=()=>{},native,loaded;
 try{
  host=await Host.open({endpoint:item.endpoint,expected:item.selection,principal:'operator',getToken:async()=>{await onToken();return allowed?fixtures.controls.token(item.path):'0'.repeat(64);},checkAuthority(){}});
  f=await roomUnionFixture({...options,fixtures,item});
  const id='independent-delivery',selected=f.f.f.rows.find(row=>row.id===id).owner.options,member=f.owner.clients.find(row=>row.id===id),depths={document:[member.core.view().undoDepth,member.core.view().redoDepth],review:[member.core.reviewSnapshot().view.undoDepth,member.core.reviewSnapshot().view.redoDepth]};
  const accepted=await physicalRecoveryHostPort(host).readAcceptedNative({document:'include',review:{kind:'start'}});assert.equal(accepted.review.more,false);
  loaded=await Loaded.read(f.retained,f.integrity);const records=await loaded.records(id),recovery=records.source.live,segmented=recovery.source.identity.documentHistory==='segmented-v1';native=new SharedRichEditor(segmented?f.f.f.profile.restore_segmented(selected.room,recovery.source.documentCheckpoint):f.f.f.profile.restore(selected.room,recovery.source.documentCheckpoint),segmented?{segmentedHistory:'segmented-v1'}:{});
  if(recovery.source.identity.reviewHistory==='segmented-v1')native.enableSegmentedReview(selected.review,recovery.source.reviewCheckpoint);else native.enableReview(selected.review,recovery.source.reviewCheckpoint);
  await native.receiveFrame(accepted.documentFrame);for(const batch of accepted.review.batches){const source=reviewSource(batch.source);assert.notEqual(native.receiveReview(batch.frame,source).kind,'pending');assert.ok(sameReceipt(native.retainedReviewReceipt(batch.frame,source),batch.receipt));}
  const next={...recovery,source:{...recovery.source,documentCheckpoint:native.checkpointJson(),reviewCheckpoint:recovery.source.identity.reviewHistory==='segmented-v1'?native.reviewSegmentedCheckpoint():native.reviewCheckpoint()}},retained=await replaceRoomRecords(f.retained,id,records=>{records.source.live=next;},f.integrity),ranges=new Map();
  for(const batch of accepted.review.batches)if(batch.source.actor!==selected.review.actor){const old=ranges.get(batch.source.actor);assert.ok(!old||old.principal===batch.source.principal);ranges.set(batch.source.actor,{actor:batch.source.actor,principal:batch.source.principal,from:'1',through:old&&BigInt(old.through)>BigInt(batch.receipt.through)?old.through:batch.receipt.through});}
  assert.ok(ranges.size);const authentication={host,originalReview:[{id,query:{binding:accepted.review.descriptor.binding,ranges:[...ranges.values()].sort((a,b)=>a.actor<b.actor?-1:a.actor>b.actor?1:0)}}]},preview={database:f.options.database,participants:f.options.participants,retained,authentication},read={wasm:f.integrity.wasm,reads:f.read.reads,authentication,checkAuthority(){}};
  const nativeState=()=>f.owner.clients.map(row=>({id:row.id,document:row.core.checkpointJson(),review:row.core.reviewHistoryPolicy()==='segmented-v1'?row.core.reviewSegmentedCheckpoint():row.core.reviewCheckpoint()}));
  loaded.dispose();loaded=undefined;native.dispose();native=undefined;
  return{...f,host,preview,read,authentication,retained,accepted,depths,nativeState,onToken(fn){onToken=fn;},allowToken(value){allowed=value;},async close(){host.close();await f.close();}};
 }catch(error){native?.dispose();loaded?.dispose();host?.close();await f?.close();throw error;}
}
