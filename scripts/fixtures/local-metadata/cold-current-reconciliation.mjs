import {localReviewRaw} from '../selected-delivery/local-review-evidence.mjs';
/** Reopen all seven real Native clients with fourteen unsent offline suffixes.
 * A historical checked DATA record supplies no current reconciliation or ACK. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {withSelectedNativeDeliverySources as held} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {SelectedLocalReviewDelivery as Review} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {previewSelectedLocalReviewResume,previewSelectedLocalReviewHandover} from '../../../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_admission.js';
import {SelectedLocalMetadataDelivery as Metadata,previewSelectedLocalMetadataResume} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
import {controls,handoverControls} from '../selected-delivery/cold-continuation.mjs';
import {checkFutureNativeHistories} from './future-native-histories.mjs';
import {PacketRasterFixtureImage} from './packet-raster.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const reviewCheckpoint=core=>core.reviewHistoryPolicy()==='segmented-v1'?core.reviewSegmentedCheckpoint():core.reviewCheckpoint();
const policies=core=>({document:core.segmentedHistoryPolicy()??'original',review:core.reviewHistoryPolicy()});

export async function testColdCurrentReconciliation(input){
 const {session,host,first,fixture,bundle,deliveryChoice,parentChoice,remoteAsset,adapters,contexts,requests,settle,readCacheCalls}=input;
 assert.ok(bundle);assert.equal(typeof readCacheCalls,'function');assert.equal(readCacheCalls(),0);
 const timed=async(label,run)=>{const start=performance.now(),cpu=process.cpuUsage();console.log('JOINT_RECOVERY_STAGE '+JSON.stringify({label,phase:'start',at:new Date().toISOString()}));try{return await run();}finally{console.log('JOINT_RECOVERY_STAGE '+JSON.stringify({label,phase:'end',at:new Date().toISOString(),elapsedMs:performance.now()-start,cpuMicroseconds:process.cpuUsage(cpu)}));}};
 const metadataText=await bundle.metadata.file.text(),stored=JSON.parse(metadataText),oldCalls=session.f.oldCalls;
 const originalRevisionSubmits=requests.filter(kind=>kind==='suggestionRevisionPublish').length;
 const uploads=[];
 for(const row of session.owner.clients){const info=await session.owner.assets(row.id).get(remoteAsset);if(info){assert.equal(info.status,'uploaded');assert.ok(info.storageRef);uploads.push({id:row.id,info});}}
 assert.equal(uploads.length,3);const oldCores=session.owner.clients.map(row=>row.core);
 for(const row of session.owner.clients){
  const point={block:'p',offset:'0',affinity:'after'};row.core.select({kind:'text',anchor:point,focus:point});
  row.core.type('Unsent cold current text '+row.id+' 🙂 ');
  row.core.dispatchReview({kind:'create_thread',data:{anchorJson:row.core.captureReviewAnchor({kind:'document'}),body:'Unsent cold current comment '+row.id}});
 }
 const selected=session.owner.clients.map(row=>({id:row.id,document:row.core.checkpointJson(),review:reviewCheckpoint(row.core),text:row.core.documentJson(),policies:policies(row.core)}));
 let nativeRestart=null;
 if(input.restartNativeServer){
  for(const context of contexts)await context.close();for(const adapter of adapters)adapter.dispose();await Promise.all(adapters.map(adapter=>adapter.waitForDisconnected()));
  const retained=await timed('retain-complete-client-current',()=>session.retain()),bytes=Buffer.from(await retained.file.arrayBuffer()),file=join(host.directory,'clients-before-native-restart.archive');writeFileSync(file,bytes,{flag:'wx',mode:0o600});const handle=openSync(file,'r');try{fsyncSync(handle);}finally{closeSync(handle);}assert.deepEqual(readFileSync(file),bytes);
  const previous=host.snapshots.at(-1),restarted=await timed('actual-native-epoch-restart',()=>host.restart());assert.ok(restarted.sequence>previous.sequence);
  const observationFile=join(host.directory,'language-3-standard-true-atomic-true','native-restart-'+restarted.sequence+'-observation.json'),observationBytes=readFileSync(observationFile),observation=JSON.parse(observationBytes);
  assert.equal(observation.format,'breditor/native-joint-restart-observation');assert.equal(observation.request,restarted.sequence);
  for(const key of ['sameOperationalDirectory','freshAccountAuthentication','allProtectedRegistrationsVerified','actualNativeEpochCommitted'])assert.equal(observation[key],true,key);
  assert.notDeepEqual(observation.prior,observation.current);assert.equal(observation.wholeRoomActivated,false);
  nativeRestart={actualNativeServiceRestart:true,retainedClientArchive:{file,bytes:bytes.length,sha256:sha(bytes)},sequence:restarted.sequence,observation:{file:observationFile,bytes:observationBytes.length,sha256:sha(observationBytes),...observation}};
  console.log('COLD_CURRENT_RECONCILIATION_STEP actual-native-service-epoch-restart-after-durable-client-capture');
 }
 let policyCalls=0;await timed('reopen-all-seven-client-owners',()=>session.cold(bundle.parent.current,{checkAuthority(){policyCalls++;}}));
 assert.ok(policyCalls>0);assert.equal(session.f.oldCalls,oldCalls);
 for(const row of session.owner.clients){const expected=selected.find(value=>value.id===row.id);assert.ok(expected);assert.equal(oldCores.includes(row.core),false);assert.equal(row.core.checkpointJson(),expected.document);assert.equal(reviewCheckpoint(row.core),expected.review);assert.equal(row.core.documentJson(),expected.text);assert.deepEqual(policies(row.core),expected.policies);}
 for(const row of uploads)assert.deepEqual(await session.owner.assets(row.id).get(remoteAsset),row.info);
 console.log('COLD_CURRENT_RECONCILIATION_STEP seven-new-owners-retain-fourteen-offline-suffixes-and-real-upload-acks');

 const sealed=input.sealedHandover?await timed('sealed-native-handover',()=>host.handover()):undefined;
 if(sealed){
  assert.notDeepEqual(sealed.selection.source.origin,first.selection.source.origin);
  console.log('COLD_METADATA_HANDOVER_STEP sealed-successor-has-a-new-restore-origin');
 }

 const image=Object.getOwnPropertyDescriptor(globalThis,'Image');Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});
 let finalReport;
 try{await held(session.owner,session.input(),async(scope,sources,check)=>{
  let fresh,review,metadata;
  try{
   fresh=sealed?await handoverControls(host,sealed,scope):await controls(host,first,scope);
   const parentInput={choice:parentChoice,bundle:bundle.parent,...(sealed?{}:{baseline:fresh.baseline}),path:fresh.path,server:fresh.server,inventory:fresh.inventory,checkAuthority:check};
   const preview=sealed?previewSelectedLocalReviewHandover:previewSelectedLocalReviewResume;
   const resume=(scope,input)=>sealed?Review.resumeAcrossHandover(scope,input):Review.resume(scope,input);
   let decisions=0;
   if(sealed){
    await assert.rejects(preview({...scope},parentInput));
    await assert.rejects(preview(scope,{...parentInput,path:{...fresh.path}}));
   }
   const expected=await preview(scope,parentInput);
   if(sealed){
    await assert.rejects(resume(scope,{...parentInput,expected,approve(){decisions++;return false;}}));
    assert.equal(decisions,1);
    assert.deepEqual(await preview(scope,parentInput),expected);
   }
   review=await resume(scope,{...parentInput,expected,approve(){decisions++;return true;}});
   if(sealed)assert.equal(decisions,2);
   const metadataInput={choice:deliveryChoice,bundle,checkAuthority:check},metadataExpected=await previewSelectedLocalMetadataResume(review,metadataInput);
   metadata=await Metadata.reopen(review,{...metadataInput,expected:metadataExpected,approve:()=>true});assert.deepEqual(metadata.recovery(),stored);
   const current=async()=>{
    const parentStoredBefore=await localReviewRaw(parentChoice.database),parentCurrentBefore=JSON.parse(parentStoredBefore.current);
    const lanes=metadata.recovery().current.lanes.map(lane=>{const row=sources.find(value=>value.id===lane.id);assert.ok(row);const parentLane=parentCurrentBefore.lanes.find(value=>value.id===lane.id);assert.ok(parentLane);return {...lane,relay:parentLane.relay,source:{...lane.source,documentCheckpoint:row.source.core.checkpointJson(),reviewCheckpoint:reviewCheckpoint(row.source.core)}};}),stamps=new Map(sources.map(row=>[row.id,coreReadStamp(row.source.core)]));
    const originalFetch=globalThis.fetch;let forbiddenDownloads=0;
    globalThis.fetch=(url,options)=>{const address=String(url);if(!address.startsWith('blob:')){const path=new URL(address).pathname;if(path.endsWith('/metadata/packet/read')||path.includes('/document-versions/v1/packets/')||path.includes('/assets/')&&!path.endsWith('/assets/check')){forbiddenDownloads++;throw Error('Cold current reference discovery must not download a packet/raster body');}}return originalFetch(url,options);};
    try{
     const observed=await timed('current-native-source-provider-reconciliation',()=>sealed?
      metadata.captureServerPacketReconciliationAcrossHandover({host:fresh.delivery,path:fresh.path,inventory:fresh.inventory}):
      metadata.captureServerPacketReconciliation({host:fresh.previous,inventory:fresh.inventory}));
     if(sealed)assert.deepEqual(observed.handover,fresh.path.handoverSelection());
     const result=sealed?observed.read:observed;
     check();scope.check();assert.deepEqual(metadata.recovery().current.lanes,lanes);const parentStoredAfter=await localReviewRaw(parentChoice.database),parentCurrentAfter=JSON.parse(parentStoredAfter.current);assert.equal(parentStoredAfter.before,parentStoredBefore.before);assert.equal(parentCurrentAfter.revision,parentCurrentBefore.revision+1);assert.deepEqual(parentCurrentAfter.lanes.map(({id,relay})=>({id,relay})),parentCurrentBefore.lanes.map(({id,relay})=>({id,relay})));for(const row of sources)assert.deepEqual(coreReadStamp(row.source.core),stamps.get(row.id));
     assert.equal(readCacheCalls(),0);assert.equal(forbiddenDownloads,0);assert.equal(await bundle.metadata.file.text(),metadataText);return result;
    }finally{globalThis.fetch=originalFetch;}
   };
   const pending=await current();assert.equal(pending.kind,'pending');
   for(const row of sources)for(const lane of ['document','review'])assert.ok(pending.original.pending.some(value=>value.kind==='head'&&value.requirement.participant===row.id&&value.requirement.lane===lane&&value.requirement.relation==='local-ahead'),row.id+' '+lane+' offline suffix');
   assert.equal(pending.pending.filter(row=>row.kind==='original'&&row.requirement.kind==='head').length,14);
   if(pending.sources.outcome.kind==='pending')assert.equal(pending.currentProvider,null);
   assert.equal(requests.filter(kind=>kind==='suggestionRevisionPublish').length,originalRevisionSubmits);
   console.log('COLD_CURRENT_RECONCILIATION_STEP fresh-read-keeps-all-fourteen-real-offline-heads-pending-without-acks');
   await input.onPending?.({scope,sources,metadata,host,check,pending});
   const delivered=await settle({scope,sources,metadata,review,host,fixture,deliveryChoice,adapters,contexts,cacheCatalogPackets:false});assert.equal(delivered.length,14);
   assert.equal(requests.filter(kind=>kind==='suggestionRevisionPublish').length,originalRevisionSubmits,'Already committed revisions are not republished on cold recovery');
   fresh.close();fresh=sealed?await handoverControls(host,await host.refresh(),scope):await controls(host,first,scope);
   const reconciled=await current();assert.equal(reconciled.kind,'checked',JSON.stringify(reconciled.pending));assert.equal(reconciled.original.kind,'pending');assert.ok(reconciled.original.pending.some(row=>row.kind==='references'));assert.deepEqual(reconciled.pending,[]);assert.equal(reconciled.currentProvider.read.assets.length,3);assert.equal(reconciled.currentProvider.uploads.length,14);assert.equal(reconciled.currentProvider.read.missing.length,0);
   const saved=await metadata.capture(),snapshot=JSON.parse(await saved.metadata.file.text());assert.deepEqual(snapshot.before,stored.before);
   for(const lane of snapshot.current.lanes){const prior=stored.current.lanes.find(row=>row.id===lane.id);assert.ok(prior);for(const old of prior.records.revisions.retained){const found=lane.records.revisions.retained.find(row=>row.packet===old.packet);assert.ok(found);assert.equal(found.previousPacket,old.previousPacket);assert.deepEqual(found.receipt,old.receipt);}}
   const files=[];
   for(const [name,file]of [['cold-current-metadata.json',saved.metadata.file],['cold-current-review.json',saved.parent.delivery.file],['cold-current-room.archive',saved.parent.current.file],['cold-current-pending.json',new Blob([JSON.stringify({kind:pending.kind,originalPending:pending.original.pending,sources:pending.sources,currentProvider:pending.currentProvider,pending:pending.pending})])],['cold-current-checked.json',new Blob([JSON.stringify({kind:reconciled.kind,originalPending:reconciled.original.pending,sources:reconciled.sources,currentProvider:reconciled.currentProvider,pending:reconciled.pending})])]]){
    const bytes=Buffer.from(await file.arrayBuffer());writeFileSync(join(host.directory,name),bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(join(host.directory,name)),bytes);files.push({name,bytes:bytes.length,sha256:sha(bytes)});
   }
   finalReport={directory:host.directory,files,nativeRestart,sealedHandover:sealed!==undefined,actualNativePolicies:selected.map(({id,policies})=>({id,...policies})),nativeParticipants:7,freshNativeOwners:7,retainedRealUploadAcks:3,retainedOfflineLanes:14,authenticatedDeliveryPasses:2,originalVersionCachesStillPending:true,forbiddenBodyDownloads:0,actualCacheCalls:readCacheCalls(),originalMetadataUnchanged:true,wholeRoomActivated:false};
  }finally{await metadata?.close();await review?.close();fresh?.close();}
 });}finally{if(image)Object.defineProperty(globalThis,'Image',image);else delete globalThis.Image;}
 assert.equal(session.f.oldCalls,oldCalls);for(const row of uploads)assert.deepEqual(await session.owner.assets(row.id).get(remoteAsset),row.info);
 checkFutureNativeHistories(session.owner.clients);assert.ok(finalReport);console.log('COLD_CURRENT_RECONCILIATION_NATIVE '+JSON.stringify({...finalReport,exactFutureDocumentAndCommentRestored:true}));
}
