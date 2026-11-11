/** Genuine promoted clients continue original review metadata across a sealed
 * Native handover. The successor listener stays private during the operation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {SharedDurableNativeActivationHost as Activation} from '../packages/breditor-collaboration/dist/native_activation_control/host.js';
import {RoomExecutionAttempt,withRoomExecutionMetadataTarget} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {
 previewHeldRoomMetadataContinuation,
 previewHeldRoomMetadataContinuationAcrossHandover,
 continueHeldRoomMetadataAcrossHandover,
} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/coordinator.js';
import {MetadataContinuationIntent} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/intent.js';
import {withHeldMetadataContinuationEvidence,withHeldHandoverMetadataContinuationEvidence} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/held_evidence.js';
import {withOriginalMetadataJournals} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/original_journals.js';
import {prepareHandoverMetadataContinuationDelivery} from '../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
import {SelectedLocalReviewDelivery as Review} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {SelectedLocalMetadataDelivery as Metadata,previewSelectedLocalMetadataResume} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {openOriginalReplacementMetadata} from './fixtures/metadata-continuation/original.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeHandoverActivationRoot} from './fixtures/native-activation/handover-root.mjs';
import {handoverControls} from './fixtures/selected-delivery/cold-continuation.mjs';
import {assertHandoverPublicationWaiting} from './fixtures/native-publication/sealed-handover.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {databaseByteSnapshot,sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {checkFutureNativeHistories} from './fixtures/local-metadata/future-native-histories.mjs';
import {saveEvidence} from './candidate-release/evidence.mjs';

const facts=state=>state.lanes.map(({id,records,relay})=>({id,records,relay}));

test('the private replacement continues acknowledged and pending metadata across the sealed lineage', {timeout:7200000},async()=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 const root=new URL('../',import.meta.url).pathname,tag='handover-metadata-continuation';
 let fixture,bundle,prepared,attempt,owner,controls,activation;
 try{
  ({fixture,bundle}=await openOriginalReplacementMetadata(root,tag,base=>selectedDeliveryNativeHost(nativeHandoverActivationRoot(base),{
   nativeActivation:true,nativeHandoverActivation:true,nativeHandoverPublication:true,suggestionGrants:true,
  })));
  const original=JSON.parse(await bundle.metadata.file.text()).current;
  assert.equal(original.lanes.length,3);
  assert.ok(original.lanes.every(row=>row.relay.reviewReceipt));
  assert.ok(original.lanes[0].records.versions.packets.some(row=>row.accepted));
  assert.ok(original.lanes[0].records.revisions.retained.some(row=>row.receipt));
  assert.ok(original.lanes.slice(1).every(row=>row.records.versions.packets.every(row=>row.accepted===null)));
  console.log('HANDOVER_METADATA_CONTINUATION_STEP original-receipts-and-pending-packets');
  prepared=await preparedRoomRun({native},tag+'-replace',{}, {s:fixture.session,retained:bundle.parent.current});
  const oldBytes=await sourceByteSnapshots();
  attempt=RoomExecutionAttempt.begin(fixture.session.owner,prepared.reads,prepared.options);
  await attempt.run(()=>true);
  const promotion=await attempt.previewPromotion();
  await attempt.promote({expected:promotion,approve:()=>true,checkAssetAuthority(){}});
  console.log('HANDOVER_METADATA_CONTINUATION_STEP seven-actual-replacement-owners');

  const sealed=await fixture.host.handover(),offer=fixture.host.handoverActivationOffer();
  assert.notDeepEqual(sealed.selection.source.origin,fixture.first.selection.source.origin);
  activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>fixture.host.activationToken(offer),checkAuthority(){}});
  assert.deepEqual((await activation.commit()).selection,offer.selection);
  await assertHandoverPublicationWaiting(fixture.host,offer);
  controls=await handoverControls(fixture.host,await fixture.host.refresh(),{check(){}});
  const reads=fixture.session.input();
  const visit=work=>withRoomExecutionMetadataTarget(attempt,reads,work);
  const common={database:tag+'-metadata-intent',preparationDatabase:tag+'-prepared-replacement',reviewDatabase:tag+'-review-replacement',metadataDatabase:tag+'-metadata-replacement',origin:bundle,inventory:controls.inventory,checkAuthority(){}};
  const input={...common,path:controls.path};
  await assert.rejects(visit((scope,witness)=>previewHeldRoomMetadataContinuationAcrossHandover(scope,witness,{...input,database:tag+'-intent'})),{code:'metadata_continuation_namespace_collision'});
  await assert.rejects(visit((scope,witness)=>previewHeldRoomMetadataContinuation(scope,witness,{...common,host:controls.delivery})),{code:'inventory_source'});
  const expected=await visit((scope,witness)=>previewHeldRoomMetadataContinuationAcrossHandover(scope,witness,input));
  assert.deepEqual(expected.handover,controls.path.handoverSelection());
  assert.equal(expected.continuation.origin.metadata.sha256,bundle.metadata.sha256);
  assert.deepEqual(expected.continuation.origin.current,bundle.parent.current.selection);
  console.log('HANDOVER_METADATA_CONTINUATION_STEP exact-origin-and-sealed-provider-preview');

  const run=(approve,resume=false,selection=expected)=>visit((scope,witness)=>continueHeldRoomMetadataAcrossHandover(scope,witness,{...input,expected:selection,approve},resume));
  let approvals=0;
  const foreign=structuredClone(expected);
  foreign.handover.path.seal.generation=String(BigInt(foreign.handover.path.seal.generation)+1n);
  await assert.rejects(run(()=>{approvals++;return true;},false,foreign),{code:'metadata_continuation_stale'});
  assert.equal(approvals,0);
  await assert.rejects(run(()=>{approvals++;return false;}));
  assert.equal(approvals,1);
  const destinations=[input.database,input.preparationDatabase,input.reviewDatabase,input.metadataDatabase];
  assert.equal((await indexedDB.databases()).some(row=>destinations.includes(row.name)),false);
  await visit((scope,witness)=>withOriginalMetadataJournals(scope,witness,bundle,async origin=>{
   await assert.rejects(withHeldHandoverMetadataContinuationEvidence(scope,origin,expected,async()=>{throw Error('Absent intent reached visitor');}),{code:'metadata_continuation_missing'});
  }));
  assert.equal((await indexedDB.databases()).some(row=>destinations.includes(row.name)),false);

  const observe=async(verifyForeign=false)=>{
   const saved=new Map(await Promise.all(destinations.map(async name=>[name,await databaseByteSnapshot(name)])));
   let expired,observation;
   const request=globalThis.fetch;
   globalThis.fetch=()=>{throw Error('Prior sealed metadata evidence must not access HTTP');};
   try{
    await visit((scope,witness)=>withOriginalMetadataJournals(scope,witness,bundle,async origin=>{
     if(verifyForeign){
      const other=structuredClone(expected);
      other.handover.current.instance='f'.repeat(64);
      assert.notEqual(other.handover.current.instance,expected.handover.current.instance);
      await assert.rejects(withHeldHandoverMetadataContinuationEvidence(scope,origin,other,async()=>{throw Error('Foreign path reached visitor');}),error=>error.code?.startsWith('metadata_continuation_'));
      await assert.rejects(withHeldMetadataContinuationEvidence(scope,origin,expected.continuation,async()=>{throw Error('Ordinary family reached sealed evidence');}),error=>error.code?.startsWith('metadata_continuation_'));
     }
     await withHeldHandoverMetadataContinuationEvidence(scope,origin,expected,async held=>{
      held.check();expired=held.check;observation=held.evidence;
      assert.equal(observation.format,'breditor/handover-metadata-continuation-evidence');
      assert.deepEqual(observation.choice,expected);
      assert.equal(observation.phase,'metadata');
     });
     assert.throws(expired,{code:'metadata_continuation_closed'});
    }));
   }finally{globalThis.fetch=request;}
   await assertSourceBytesUnchanged(saved);
   return observation;
  };

  const originalPut=IDBObjectStore.prototype.put;
  let interrupted=false;
  try{
   IDBObjectStore.prototype.put=function(...args){
    const request=originalPut.apply(this,args);
    if(!interrupted&&this.transaction.db.name===input.metadataDatabase&&args[1]==='current'){
     interrupted=true;
     this.transaction.abort();
    }
    return request;
   };
   await assert.rejects(run(choice=>{approvals++;assert.deepEqual(choice,expected);return true;}));
  }finally{IDBObjectStore.prototype.put=originalPut;}
  assert.equal(interrupted,true);
  assert.equal(approvals,2);
  const ordinary=new MetadataContinuationIntent(expected.continuation,{wasm:native,checkAuthority(){}});
  try{await assert.rejects(ordinary.reopen(bundle));}finally{await ordinary.close();}
  await assertSourceBytesUnchanged(oldBytes);
  console.log('HANDOVER_METADATA_CONTINUATION_STEP interrupted-destination-retains-handover-intent');
  const interruptedEvidence=await observe();
  const interruptedRecords=JSON.parse(interruptedEvidence.metadata);
  assert.deepEqual(interruptedRecords.current.lanes.map(row=>row.records),interruptedRecords.before.lanes.map(row=>row.records));

  const result=await run(choice=>{approvals++;assert.deepEqual(choice,expected);return true;},true);
  assert.equal(approvals,3);
  assert.deepEqual(result.choice,expected);
  assert.deepEqual(facts(JSON.parse(await result.current.metadata.file.text()).current),facts(original));
  assert.equal(await result.origin.metadata.file.text(),await bundle.metadata.file.text());
  assert.equal(await result.origin.parent.delivery.file.text(),await bundle.parent.delivery.file.text());
  await visit(async scope=>{
   let gate,review,reopened;
   try{
    const choice=expected.continuation;
    gate=await prepareHandoverMetadataContinuationDelivery(scope,controls.path,controls.inventory,choice.prepared,expected.handover,true);
    review=await Review.reopen(scope,gate,result.current.parent,{expected:choice.review,approve:()=>true,checkAuthority:scope.check});
    const selected={choice:choice.metadata,bundle:result.current,checkAuthority:scope.check};
    const resumeChoice=await previewSelectedLocalMetadataResume(review,selected);
    reopened=await Metadata.reopen(review,{...selected,expected:resumeChoice,approve:()=>true});
    assert.deepEqual(facts(reopened.recovery().current),facts(original));
   }finally{await reopened?.close();await review?.close();await gate?.close();}
  });
  await assertHandoverPublicationWaiting(fixture.host,offer);
  controls.close();
  controls=undefined;
  const completedEvidence=await observe(true);
  assert.deepEqual(facts(JSON.parse(completedEvidence.metadata).current),facts(original));
  assert.notEqual(completedEvidence.metadata,interruptedEvidence.metadata);
  console.log('HANDOVER_METADATA_CONTINUATION_STEP prior-destination-evidence-verified-without-http');
  owner=attempt.takeOwner();
  assert.equal(owner.clients.length,7);
  checkFutureNativeHistories(owner.clients);
  await assertSourceBytesUnchanged(oldBytes);
  const evidence={passed:true,actualFamilies:7,metadataLanes:3,exactSealedLineage:true,originalIntentFamilyRefused:true,interruptedWriteResumed:true,acknowledgedAndPendingFactsPreserved:true,sourceNamespacesUnchanged:true,exactFutureDocumentAndCommentHistories:true,listenerStillPrivate:true,priorEvidenceWithoutHttp:true,priorDestinationBytesUnchanged:true,foreignEvidenceRefused:true};
  saveEvidence(join(fixture.host.directory,'handover-metadata-continuation-choice.json'),result.choice);
  saveEvidence(join(fixture.host.directory,'handover-metadata-continuation.json'),evidence);
  console.log('HANDOVER_METADATA_CONTINUATION_NATIVE '+JSON.stringify({directory:fixture.host.directory,...evidence}));
 }finally{
  activation?.close();
  controls?.close();
  await owner?.discardAndClose();
  await attempt?.close();
  await prepared?.close();
  await fixture?.close();
 }
});
