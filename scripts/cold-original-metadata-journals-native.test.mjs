import {ColdRoomExecutionAttempt as Cold} from '../packages/breditor-collaboration/dist/cold_room_execution/attempt.js';
import {withColdRoomExecutionMetadataTarget} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {withOriginalMetadataJournals,checkHeldOriginalMetadataJournals} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/original_journals.js';
import {NativeReconstructionWaits} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/read_waits.js';
import {decideColdActivation} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_variant.js';
import {issueVerifiedMetadataContinuationFacts} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/native_origin.js';
import {LocalReviewDeliveryStore} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/store.js';
import {LocalMetadataDeliveryStore} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/store.js';
import {localReviewRaw} from './fixtures/selected-delivery/local-review-evidence.mjs';
/** Genuine seven-family replacement and three local metadata runtimes. Original
 * journals stay immutable; review receipts are obtained from the actual service. */
import {IDBObjectStore} from 'fake-indexeddb';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {dirname,join} from 'node:path';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {settleOriginalMetadataLane} from './fixtures/metadata-continuation/settled-lane.mjs';
import {actualLocalReviewSession} from './fixtures/selected-delivery/local-review-session.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {RoomExecutionAttempt,withRoomExecutionMetadataTarget} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {previewRoomMetadataContinuation,continueRoomMetadata,resumeRoomMetadataContinuation} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/coordinator.js';
import {SelectedLocalReviewDelivery as Review} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {SelectedLocalMetadataDelivery as Metadata,previewSelectedLocalMetadataDelivery,previewSelectedLocalMetadataResume} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {previewMetadataContinuationPreparation,prepareMetadataContinuationDelivery} from '../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
import {metadataBinding} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/policy.js';
import {emptyDeliveryRetainedRecords} from '../packages/breditor-collaboration/dist/delivery_state/retained.js';
import {independentHistoryNative} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {SharedServerLogGenerationRecoveryHost as Host} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {SharedServerLogGenerationDeliveryRecoveryHost as DeliveryHost} from '../packages/breditor-collaboration/dist/generation_delivery_control/host.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../packages/breditor-collaboration/dist/server_generation_inventory/read.js';
import {testMetadataContinuationIntent} from './fixtures/metadata-continuation/intent-storage.mjs';
import {createHash} from 'node:crypto';
import {saveEvidence} from './candidate-release/evidence.mjs';
async function retainBundle(directory,prefix,bundle){const files=[];for(const[suffix,pin,file]of[['prepared-room.archive',bundle.parent.prepared.choice.before,bundle.parent.prepared.file],['current-room.archive',bundle.parent.current.selection,bundle.parent.current.file],['review.json',bundle.parent.delivery,bundle.parent.delivery.file],['metadata.json',bundle.metadata,bundle.metadata.file]]){const bytes=Buffer.from(await file.arrayBuffer()),sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(bytes.length,pin.bytes);assert.equal(sha256,pin.sha256);const name=prefix+'-'+suffix;writeFileSync(join(directory,name),bytes,{mode:0o600});files.push({name,bytes:bytes.length,sha256,type:file.type});}return files;}
test('cold target verifies actual original journals and rejects advanced sources without losing history',{timeout:1200000},async()=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 const root=new URL('../',import.meta.url).pathname,seeds=new Map(),tag='cold-original-metadata-journals';let f,metadata,bundle,prepared,attempt,cold,owner,host,currentHost,inventory;
 const seed=async source=>{const id=independentHistoryNative(source).identity,draft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}}),packet=source.core.captureSuggestion('Original pending proposal',id.review.principal,'20',draft('Proposal ')),revision=source.core.captureSuggestionRevision(packet,'Original pending revision','21',draft('Revision ')),version=source.versionPacket(source.versions()[0].id);seeds.set(id.native.writer,{packet,revision,version});};
 try{
  f=await actualLocalReviewSession(root,tag,{hostFactory:root=>selectedDeliveryNativeHost(root,{suggestionGrants:true}),leaveOpen:true,prepareLocalInput:seed,onReady:async({review,choice:parent,fixture,check,sources,auths})=>{const descriptor=JSON.parse(fixture.inventoryJson),lanes=parent.lanes.map(row=>{const old=seeds.get(row.source.native.writer),binding=metadataBinding({suggestions:{identity:{endpoint:row.binding.endpoint,principal:row.binding.principal,room:row.binding.room,documentWriter:row.binding.documentWriter,effectWriter:descriptor.serverAuthors.find(row=>row.kind==='suggestionEffect').clock.writer,binding:descriptor.suggestionsBinding,writerTransport:'atomic-v2'},ownedHistory:null},revisions:{binding:descriptor.revisionsBinding},versions:{endpoint:row.binding.endpoint,principal:row.binding.principal,room:row.binding.room,documentWriter:row.binding.documentWriter,binding:descriptor.versionsBinding,writerTransport:'atomic-v2'}},row),records=emptyDeliveryRetainedRecords(binding);records.suggestions.retained=[{packet:old.packet,origin:'local',publish:true,publication:null,intent:null,decision:null}];records.revisions.retained=[{previousPacket:old.packet,packet:old.revision,retry:true,receipt:null,conflict:null}];records.versions.packets=[{packet:old.version,origin:'local',publish:true,accepted:null}];return{id:row.id,binding,records};}),choice=await previewSelectedLocalMetadataDelivery(review,{database:tag+'-old-metadata',lanes});metadata=await Metadata.open(review,{expected:choice,lanes,approve:()=>true,checkAuthority:check});const chosen=lanes[0],row=sources.find(row=>row.id===chosen.id);await settleOriginalMetadataLane({metadata,review,row,chosen,auth:auths.get(row.id),seeded:seeds.get(chosen.binding.suggestions.identity.documentWriter)});bundle=await metadata.capture();await metadata.close();await review.close();}});
  const original=JSON.parse(await bundle.metadata.file.text());assert.equal(original.current.lanes.length,3);assert.ok(original.current.lanes.every(row=>row.relay.reviewReceipt));assert.ok(original.current.lanes[0].records.versions.packets.some(row=>row.accepted));assert.ok(original.current.lanes[0].records.revisions.retained.some(row=>row.receipt));assert.ok(original.current.lanes.slice(1).every(row=>row.records.versions.packets.every(row=>row.accepted===null)));
  const files=await retainBundle(f.host.directory,'cold-original-input',bundle);console.log('METADATA_CONTINUATION_STEP original-mixed-acknowledged-and-pending-metadata');
  prepared=await preparedRoomRun({native},tag+'-replace',{}, {s:f.session,retained:bundle.parent.current});const oldBytes=await sourceByteSnapshots();
  attempt=RoomExecutionAttempt.begin(f.session.owner,prepared.reads,prepared.options);
  const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put,names=new Set(prepared.options.expected.execution.plan.preparation.plan.participants.filter(row=>row.id==='original').flatMap(row=>row.namespaces.filter(ns=>ns.role==='document').map(ns=>ns.database)));let interrupted=0;
  const fault=function(method,args){const request=method.apply(this,args);if(!interrupted&&names.has(this.transaction.db.name)){interrupted++;this.transaction.abort();}return request;};
  try{IDBObjectStore.prototype.add=function(...args){return fault.call(this,add,args);};IDBObjectStore.prototype.put=function(...args){return fault.call(this,put,args);};await assert.rejects(attempt.run(()=>true));assert.equal(interrupted,1);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;await attempt.close();}
  const {signal,checkAuthority,...originalOptions}=f.session.f.options;cold=Cold.resume({original:{...originalOptions,catalogDatabase:tag+'-catalog',checkAuthority(){}},run:prepared.options,reads:prepared.reads,sourceIntentDatabase:tag+'-cold-custody'});
  const expected=await cold.preview();await cold.run({expected:expected.choice,approve:()=>true});const approved=await cold.previewPromotion();await cold.promote({expected:approved,approve:()=>true,checkAssetAuthority(){}});console.log('COLD_ORIGINAL_JOURNALS_STEP actual-cold-seven-family-target-private');
  const writeCurrent=async(name,value)=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('Existing original journal required'));};q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});try{await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'current');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}};
  const observations=[];let invalidatedOriginals=0;
  await withColdRoomExecutionMetadataTarget(cold,f.session.input(),async(scope,witness)=>{
   let leaked;
   await withOriginalMetadataJournals(scope,witness,bundle,async(inspection,observation)=>{
    observations.push(observation);leaked=inspection;assert.deepEqual(inspection.snapshot,original);assert.equal(inspection.snapshot.current.lanes.length,3);
    const leases=[new LocalReviewDeliveryStore(inspection.choice.parent,()=>scope.check()),new LocalMetadataDeliveryStore(inspection.choice,()=>scope.check())];
    for(const store of leases)try{await assert.rejects(store.open(),error=>/busy/.test(error.code));}finally{await store.close();}
   });
   let reflected=0;const choices=new Proxy({},{ownKeys(){reflected++;throw Error('Expired inspection cannot read a new choice');}});assert.throws(()=>issueVerifiedMetadataContinuationFacts(leaked,choices,choices),error=>error.code==='metadata_continuation_closed');assert.equal(reflected,0);scope.check();
   const reviewName=original.current.choice.parent.database,metadataName=original.current.choice.database,oldReview=(await localReviewRaw(reviewName)).current,oldMetadata=(await localReviewRaw(metadataName)).current;
   try{
    for(const[name,text]of[[reviewName,oldReview],[metadataName,oldMetadata]]){const value=JSON.parse(text);value.revision++;await writeCurrent(name,JSON.stringify(value));}
    await withOriginalMetadataJournals(scope,witness,bundle,async(_inspection,observation)=>{observations.push(observation);assert.equal(observation.review.actualRevision,observation.review.retainedRevision+1);assert.equal(observation.metadata.actualRevision,observation.metadata.retainedRevision+1);});
   }finally{await writeCurrent(reviewName,oldReview);await writeCurrent(metadataName,oldMetadata);}
   const advanced=JSON.parse(oldMetadata);advanced.revision+=2;
   try{await writeCurrent(metadataName,JSON.stringify(advanced));await assert.rejects(withOriginalMetadataJournals(scope,witness,bundle,async()=>{throw Error('Advanced original must not enter callback');}),error=>error.code==='metadata_continuation_original_journal_changed');}
   finally{await writeCurrent(metadataName,oldMetadata);}
   scope.check();
   // Real versionchange closes each actual old journal store. The inspection
   // must refuse immediately, before interpreting any new continuation choice.
   // Restore only these test-owned databases from their literal original rows.
   for(const [name,closedCode]of [[metadataName,'local_metadata_delivery_closed'],[reviewName,'local_review_delivery_closed']]){
    const originalRaw=await localReviewRaw(name);let reflected=0;
    try{
     await assert.rejects(withOriginalMetadataJournals(scope,witness,bundle,async(inspection,_observation,revocations)=>{
      const waits=new NativeReconstructionWaits(()=>checkHeldOriginalMetadataJournals(scope,inspection),[scope.signal,...revocations]);
      const late=Promise.withResolvers();
      let invoked=0,deadline;
      const declined=assert.rejects(decideColdActivation(undefined,()=>{
       invoked++;
       return late.promise;
      },waits),{code:'asset_adoption_aborted'});
      try{
       assert.equal(invoked,1);
       await new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase(name);q.onsuccess=resolve;q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Actual original journal did not close for versionchange'));});
       assert.equal(revocations.filter(signal=>signal.aborted).length,1);
       await Promise.race([declined,new Promise((_resolve,reject)=>{
        deadline=setTimeout(()=>reject(Error('Original journal revocation did not cancel approval')),2000);
       })]);
      }finally{clearTimeout(deadline);late.resolve(true);waits.close();await declined;}
      assert.equal((await indexedDB.databases()).some(row=>row.name===name),false);
      const poison=new Proxy({},{ownKeys(){reflected++;throw Error('Invalidated journal reflected a new continuation choice');}});
      assert.throws(()=>issueVerifiedMetadataContinuationFacts(inspection,poison,poison),error=>error.code===closedCode);assert.equal(reflected,0);
     }),error=>error.code===closedCode);
    }finally{
     await new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>{const state=q.result.createObjectStore('state');state.add(originalRaw.before,'before');state.add(originalRaw.current,'current');};q.onerror=()=>reject(q.error);q.onsuccess=()=>{q.result.close();resolve();};});
    }
    assert.equal(reflected,0);invalidatedOriginals++;
   }
   assert.equal(invalidatedOriginals,2);scope.check();
   console.log('COLD_ORIGINAL_JOURNALS_STEP either-journal-revocation-ended-pending-approval');
  });
  owner=cold.takeOwner();assert.equal(owner.clients.length,7);for(const row of owner.clients){const previous=prepared.f.clients.find(old=>old.id===row.id);assert.deepEqual(nativePair(row.core),previous.pair);const document=row.core.documentJson(),review=row.core.reviewSnapshot().view;assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),document);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');assert.deepEqual(row.core.reviewSnapshot().view,review);}await assertSourceBytesUnchanged(oldBytes);
  saveEvidence(f.host.directory+'/cold-original-journals.json',{actualFamilies:7,actualLocalMetadataLanes:3,actualInterruptedWarmExecution:true,actualFreshColdTarget:true,originalFactsAndPendingPreserved:true,originalNamespacesUnchanged:true,expiredInspectionRefused:true,advancedOriginalRefused:true,exactFutureDocumentAndCommentHistories:true,observations,originalInvalidatedJournalsRefused:invalidatedOriginals,invalidatedJournalInputReflection:0,files,wholeRoomActivated:false});console.log('COLD_ORIGINAL_JOURNALS_STEP original-facts-and-future-histories-preserved');
 }finally{await owner?.discardAndClose();await cold?.close();await attempt?.close();await metadata?.close();await prepared?.close();await f?.close();}
});
