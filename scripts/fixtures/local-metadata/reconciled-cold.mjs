/** Real post-ACK client restart. Keep the Native server alive, retire all seven
 * browser/native source owners, and reacquire fresh parents from retained data.
 * No saved report grants authority or installs an upload/publication receipt. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {withSelectedNativeDeliverySources as held} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {SelectedLocalReviewDelivery as Review} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {previewSelectedLocalReviewResume} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_admission.js';
import {SelectedLocalMetadataDelivery as Metadata,previewSelectedLocalMetadataResume} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {controls} from '../selected-delivery/cold-continuation.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const reviewCheckpoint=core=>core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint();

export async function testReconciledCold(input){
 const {session,host,first,fixture,bundle,deliveryChoice,parentChoice,remoteAsset,adapters,contexts,requests,settle}=input;
 assert.ok(bundle,'Retain the actual completed metadata bundle before source retirement');
 const metadataText=await bundle.metadata.file.text(),stored=JSON.parse(metadataText),oldCalls=session.f.oldCalls;
 const originalRevisionSubmits=requests.filter(kind=>kind==='suggestionRevisionPublish').length;
 const uploaded=[];
 for(const row of session.owner.clients){
  const info=await session.owner.assets(row.id).get(remoteAsset);
  if(info){assert.equal(info.status,'uploaded');assert.equal(typeof info.storageRef,'string');uploaded.push({id:row.id,info});}
 }
 assert.equal(uploaded.length,3);
 const oldCores=session.owner.clients.map(row=>row.core);
 for(const row of session.owner.clients){
  const point={block:'p',offset:'0',affinity:'after'};
  row.core.select({kind:'text',anchor:point,focus:point});
  row.core.type('Post-ACK offline text '+row.id+' 🙂 ');
  row.core.dispatchReview({kind:'create_thread',data:{anchorJson:row.core.captureReviewAnchor({kind:'document'}),body:'Post-ACK offline comment '+row.id}});
 }
 const selected=session.owner.clients.map(row=>({id:row.id,document:row.core.checkpointJson(),review:reviewCheckpoint(row.core),text:row.core.documentJson()}));
 let policyCalls=0;
 await session.cold(bundle.parent.current,{checkAuthority(){policyCalls++;}});
 assert.ok(policyCalls>0);assert.equal(session.f.oldCalls,oldCalls);
 for(const row of session.owner.clients){
  const expected=selected.find(value=>value.id===row.id);assert.ok(expected);
  assert.equal(oldCores.includes(row.core),false);
  assert.equal(row.core.checkpointJson(),expected.document);
  assert.equal(reviewCheckpoint(row.core),expected.review);
  assert.equal(row.core.documentJson(),expected.text);
  assert.ok(expected.text.includes('Post-ACK offline text '+row.id));
 }
 for(const row of uploaded)assert.deepEqual(await session.owner.assets(row.id).get(remoteAsset),row.info,'A real durable upload ACK must survive unchanged');
 console.log('PROVIDER_RECONCILIATION_COLD_STEP seven-new-native-owners-offline-histories-and-real-upload-acks');

 await held(session.owner,session.input(),async(scope,sources,check)=>{
  let fresh,review,metadata;
  try{
   fresh=await controls(host,first,scope);
   const parentInput={choice:parentChoice,bundle:bundle.parent,baseline:fresh.baseline,path:fresh.path,server:fresh.server,inventory:fresh.inventory,checkAuthority:check};
   const expected=await previewSelectedLocalReviewResume(scope,parentInput);
   review=await Review.resume(scope,{...parentInput,expected,approve:()=>true});
   const metadataInput={choice:deliveryChoice,bundle,checkAuthority:check};
   const metadataExpected=await previewSelectedLocalMetadataResume(review,metadataInput);
   metadata=await Metadata.reopen(review,{...metadataInput,expected:metadataExpected,approve:()=>true});
   assert.deepEqual(metadata.recovery(),stored);
   assert.equal(await bundle.metadata.file.text(),metadataText);
   const pending=await metadata.captureReconciliation({host:fresh.previous,inventory:fresh.inventory});
   assert.equal(pending.kind,'pending');
   for(const row of sources)for(const lane of ['document','review'])assert.ok(pending.pending.some(value=>value.kind==='head'&&value.requirement.participant===row.id&&value.requirement.lane===lane&&value.requirement.relation==='local-ahead'),row.id+' '+lane+' must retain its actual offline suffix');
   console.log('PROVIDER_RECONCILIATION_COLD_STEP fresh-authenticated-parents-preserve-all-fourteen-pending-native-suffixes');
   const delivered=await settle({scope,sources,metadata,review,host,fixture,deliveryChoice,adapters,contexts});
   assert.equal(delivered.length,14);
   assert.equal(requests.filter(kind=>kind==='suggestionRevisionPublish').length,originalRevisionSubmits,'Committed original revisions must not be republished on cold resume');
   fresh.close();fresh=await controls(host,first,scope);
   const reconciled=await metadata.captureReconciliation({host:fresh.previous,inventory:fresh.inventory});
   assert.equal(reconciled.kind,'checked',JSON.stringify(reconciled.pending));assert.deepEqual(reconciled.pending,[]);
   assert.ok(reconciled.reviews.every(row=>row.receiptVerified));
   const saved=await metadata.capture(),current=JSON.parse(await saved.metadata.file.text());
   assert.deepEqual(current.before,stored.before);
   assert.equal(await bundle.metadata.file.text(),metadataText);
   for(const row of current.current.lanes){
    const before=stored.current.lanes.find(value=>value.id===row.id);assert.ok(before);
    for(const old of before.records.revisions.retained){const actual=row.records.revisions.retained.find(value=>value.packet===old.packet);assert.ok(actual);assert.deepEqual(actual.receipt,old.receipt);assert.equal(actual.previousPacket,old.previousPacket);}
   }
   const files=[];
   for(const [name,file]of [['provider-reconciliation-cold-metadata.json',saved.metadata.file],['provider-reconciliation-cold-review.json',saved.parent.delivery.file],['provider-reconciliation-cold-current.archive',saved.parent.current.file],['provider-reconciliation-cold-pending.json',new Blob([JSON.stringify(pending)])],['provider-reconciliation-cold-checked.json',new Blob([JSON.stringify(reconciled)])]]){
    const bytes=Buffer.from(await file.arrayBuffer());writeFileSync(join(host.directory,name),bytes,{mode:0o600,flag:'wx'});const actual=readFileSync(join(host.directory,name));assert.deepEqual(actual,bytes);files.push({name,bytes:bytes.length,sha256:sha(bytes)});
   }
   console.log('PROVIDER_RECONCILIATION_COLD_NATIVE '+JSON.stringify({directory:host.directory,files,nativeParticipants:7,freshNativeOwners:7,retainedRealUploadAcks:3,retainedOfflineLanes:14,authenticatedDeliveryPasses:2,originalMetadataUnchanged:true,wholeRoomActivated:false}));
  }finally{await metadata?.close();await review?.close();fresh?.close();}
 });
 assert.equal(session.f.oldCalls,oldCalls);
 for(const row of session.owner.clients){
  const text=row.core.documentJson();assert.ok(text.includes('Post-ACK offline text '+row.id));
  assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),text);
  assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');
 }
 for(const row of uploaded)assert.deepEqual(await session.owner.assets(row.id).get(remoteAsset),row.info);
 console.log('PROVIDER_RECONCILIATION_COLD_STEP all-future-native-undo-redo-and-upload-facts-survive');
}
