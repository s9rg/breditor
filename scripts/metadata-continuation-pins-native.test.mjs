import {captureMetadataContinuationPins} from '../packages/breditor-collaboration/dist/metadata_continuation_pins/capture.js';
import {withHeldMetadataContinuationPins} from '../packages/breditor-collaboration/dist/metadata_continuation_pins/held_evidence.js';
import {captureMetadataContinuationPinArchive} from '../packages/breditor-collaboration/dist/metadata_continuation_pins/capture_archive.js';
import {readMetadataContinuationPinArchive} from '../packages/breditor-collaboration/dist/metadata_continuation_pins/read_archive.js';
import {withHeldAbsentMetadataContinuation} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/held_absence.js';
import {withOriginalMetadataJournals} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/original_journals.js';
import {withHeldMetadataContinuationEvidence} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/held_evidence.js';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {databaseByteSnapshot} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {withPayloadReadDiagnostics} from './fixtures/native-publication/payload-read-diagnostics.mjs';
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
import {previewRoomMetadataContinuation,continueRoomMetadata,resumeRoomMetadataContinuation,continueHeldRoomMetadata,previewHeldRoomMetadataContinuation} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/coordinator.js';
import {metadataContinuationPreviewRequest as previewRequest,metadataContinuationRunRequest as runRequest} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/requests.js';
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
test('compact pins re-admit every actual interrupted metadata phase without writes or copied authority',{timeout:7200000},async t=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 const root=new URL('../',import.meta.url).pathname,seeds=new Map(),tag='metadata-continuation-evidence';let f,metadata,bundle,prepared,attempt,owner,host,currentHost,inventory;
 const seed=async source=>{const id=independentHistoryNative(source).identity,draft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}}),packet=source.core.captureSuggestion('Original pending proposal',id.review.principal,'20',draft('Proposal ')),revision=source.core.captureSuggestionRevision(packet,'Original pending revision','21',draft('Revision ')),version=source.versionPacket(source.versions()[0].id);seeds.set(id.native.writer,{packet,revision,version});};
 try{
  f=await actualLocalReviewSession(root,tag,{hostFactory:root=>selectedDeliveryNativeHost(root,{suggestionGrants:true}),leaveOpen:true,prepareLocalInput:seed,onReady:async({review,choice:parent,fixture,check,sources,auths})=>{const descriptor=JSON.parse(fixture.inventoryJson),lanes=parent.lanes.map(row=>{const old=seeds.get(row.source.native.writer),binding=metadataBinding({suggestions:{identity:{endpoint:row.binding.endpoint,principal:row.binding.principal,room:row.binding.room,documentWriter:row.binding.documentWriter,effectWriter:descriptor.serverAuthors.find(row=>row.kind==='suggestionEffect').clock.writer,binding:descriptor.suggestionsBinding,writerTransport:'atomic-v2'},ownedHistory:null},revisions:{binding:descriptor.revisionsBinding},versions:{endpoint:row.binding.endpoint,principal:row.binding.principal,room:row.binding.room,documentWriter:row.binding.documentWriter,binding:descriptor.versionsBinding,writerTransport:'atomic-v2'}},row),records=emptyDeliveryRetainedRecords(binding);records.suggestions.retained=[{packet:old.packet,origin:'local',publish:true,publication:null,intent:null,decision:null}];records.revisions.retained=[{previousPacket:old.packet,packet:old.revision,retry:true,receipt:null,conflict:null}];records.versions.packets=[{packet:old.version,origin:'local',publish:true,accepted:null}];return{id:row.id,binding,records};}),choice=await previewSelectedLocalMetadataDelivery(review,{database:tag+'-old-metadata',lanes});metadata=await Metadata.open(review,{expected:choice,lanes,approve:()=>true,checkAuthority:check});const chosen=lanes[0],row=sources.find(row=>row.id===chosen.id);await settleOriginalMetadataLane({metadata,review,row,chosen,auth:auths.get(row.id),seeded:seeds.get(chosen.binding.suggestions.identity.documentWriter)});bundle=await metadata.capture();await metadata.close();await review.close();}});
  const original=JSON.parse(await bundle.metadata.file.text());assert.equal(original.current.lanes.length,3);assert.ok(original.current.lanes.every(row=>row.relay.reviewReceipt));assert.ok(original.current.lanes[0].records.versions.packets.some(row=>row.accepted));assert.ok(original.current.lanes[0].records.revisions.retained.some(row=>row.receipt));assert.ok(original.current.lanes.slice(1).every(row=>row.records.versions.packets.every(row=>row.accepted===null)));
  console.log('METADATA_CONTINUATION_STEP original-mixed-acknowledged-and-pending-metadata');
  prepared=await preparedRoomRun({native},tag+'-replace',{}, {s:f.session,retained:bundle.parent.current});const oldBytes=await sourceByteSnapshots();
  attempt=RoomExecutionAttempt.begin(f.session.owner,prepared.reads,prepared.options);await attempt.run(()=>true);const promote=await attempt.previewPromotion();await attempt.promote({expected:promote,approve:()=>true,checkAssetAuthority(){}});console.log('METADATA_CONTINUATION_STEP genuine-seven-family-replacement-held');
  const latest=await f.host.refreshAfter(f.first);currentHost=await Host.open({endpoint:latest.endpoint,expected:latest.selection,principal:'operator',getToken:()=>f.host.operatorToken(latest),checkAuthority(){}});host=await DeliveryHost.open({endpoint:latest.deliveryEndpoint,expected:latest.deliverySelection,current:currentHost,principal:'operator',getToken:()=>f.host.operatorToken(latest),checkAuthority(){}});inventory=await Inventory.read(new Blob([readFileSync(join(dirname(latest.path),'inventory.json'))]),latest.selection.source.participants);
  const input={database:tag+'-metadata-intent',preparationDatabase:tag+'-new-prepared',reviewDatabase:tag+'-new-review',metadataDatabase:tag+'-new-metadata',origin:bundle,host,inventory,checkAuthority(){}};
  let result;const observations=[],pinObservations=[];
  await withPayloadReadDiagnostics(()=>withRoomExecutionMetadataTarget(attempt,f.session.input(),async(scope,witness)=>{
   await withOriginalMetadataJournals(scope,witness,bundle,async originalInspection=>{
    const expected=await previewHeldRoomMetadataContinuation(scope,witness,input);
    const names=[input.database,input.preparationDatabase,input.reviewDatabase,input.metadataDatabase];
    const evidence=async phase=>{
     const before=new Map();for(const name of names)if((await indexedDB.databases()).some(row=>row.name===name))before.set(name,await databaseByteSnapshot(name));
     let held,pins,pinHeld,writes=0;const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;
     try{IDBObjectStore.prototype.add=function(...args){if(names.includes(this.transaction.db.name))writes++;return add.apply(this,args);};IDBObjectStore.prototype.put=function(...args){if(names.includes(this.transaction.db.name))writes++;return put.apply(this,args);};
      await withHeldMetadataContinuationEvidence(scope,originalInspection,expected,async actual=>{
       held=actual;assert.equal(actual.evidence.phase,phase);actual.check();
       for(const name of names){let lease;try{await assert.rejects(async()=>{lease=await RecoveryLease.acquire(JSON.stringify(name));},error=>error.code==='recovery_in_use');}finally{await lease?.close();}}
       if(actual.evidence.review)assert.ok(JSON.parse(actual.evidence.review).current.lanes.length===3);
       if(actual.evidence.metadata){const current=JSON.parse(actual.evidence.metadata);assert.equal(current.current.lanes.length,3);if(observations.some(o=>o.phase==='metadata'))assert.deepEqual(current.current.lanes.map(row=>row.records),original.current.lanes.map(row=>row.records));}
       const archive=await captureMetadataContinuationPinArchive(actual.evidence,{wasm:native,checkAuthority:actual.check,signal:scope.signal});actual.check();
       pins=archive.pins;assert.deepEqual(pins,await captureMetadataContinuationPins(actual.evidence,{wasm:native,checkAuthority:actual.check,signal:scope.signal}));
       assert.deepEqual(await readMetadataContinuationPinArchive(structuredClone(archive),pins,{wasm:native,checkAuthority:actual.check,signal:scope.signal}),actual.evidence);actual.check();
       pinObservations.push({phase,pins,canonicalObservationBytes:Buffer.byteLength(JSON.stringify(actual.evidence)),compactBytes:Buffer.byteLength(JSON.stringify(pins))});
       observations.push(actual.evidence);return undefined;
      });
      await withHeldMetadataContinuationPins(scope,originalInspection,pins,async actual=>{
       pinHeld=actual;actual.check();assert.deepEqual(actual.pins,pins);
       for(const name of names){let lease;try{await assert.rejects(async()=>{lease=await RecoveryLease.acquire(JSON.stringify(name));},error=>error.code==='recovery_in_use');}finally{await lease?.close();}}
      });
      assert.throws(()=>pinHeld.check(),error=>error.code==='metadata_pins_closed');
      const wrong=structuredClone(pins);if(wrong.metadata)wrong.metadata.sha256=wrong.metadata.sha256==='0'.repeat(64)?'1'.repeat(64):'0'.repeat(64);else if(wrong.review)wrong.review.sha256=wrong.review.sha256==='0'.repeat(64)?'1'.repeat(64):'0'.repeat(64);else wrong.phase=phase==='intent'?'prepared':'intent';
      let visited=false;await assert.rejects(withHeldMetadataContinuationPins(scope,originalInspection,wrong,async()=>{visited=true;}),error=>error.code==='metadata_pins_stale');assert.equal(visited,false);
     }finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;}
     assert.equal(writes,0);assert.throws(()=>held.check(),error=>error.code==='metadata_continuation_closed');
     for(const[name,bytes]of before)assert.deepEqual(await databaseByteSnapshot(name),bytes);
     const present=await indexedDB.databases();for(const name of names)assert.equal(present.some(row=>row.name===name),before.has(name));
     console.log('CONTINUATION_EVIDENCE_PHASE '+phase);
    };
    let absentCheck;const absenceNames={database:input.database,preparationDatabase:input.preparationDatabase,reviewDatabase:input.reviewDatabase,metadataDatabase:input.metadataDatabase};
    await withHeldAbsentMetadataContinuation(scope,originalInspection,absenceNames,async(absence,check)=>{absentCheck=check;check();assert.deepEqual(absence.destinations,absenceNames);for(const name of names){let lease;try{await assert.rejects(async()=>{lease=await RecoveryLease.acquire(JSON.stringify(name));},error=>error.code==='recovery_in_use');}finally{await lease?.close();}}});
    assert.throws(()=>absentCheck(),error=>error.code==='metadata_continuation_closed');
    await evidence('absent');
    const interrupt=async(name,key,occurrence=1,first=false)=>{
     const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;let seen=0,aborted=false;
     const apply=function(method,args){const request=method.apply(this,args);if(this.transaction.db.name===name&&(key===null||args[1]===key)&&++seen===occurrence){aborted=true;this.transaction.abort();}return request;};
     try{
      IDBObjectStore.prototype.add=function(...args){return apply.call(this,add,args);};
      IDBObjectStore.prototype.put=function(...args){return apply.call(this,put,args);};
      await assert.rejects(
       continueHeldRoomMetadata(scope,witness,runRequest({...input,expected,approve:()=>true}),!first),
       error=>{
        if(aborted)return true;
        console.error('METADATA_INTERRUPTION_NOT_REACHED',JSON.stringify({name,key,occurrence,seen}));
        throw error;
       },
      );
     }finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;}
    };
    await interrupt(input.preparationDatabase,null,1,true);await evidence('intent');await assert.rejects(withHeldAbsentMetadataContinuation(scope,originalInspection,absenceNames,async()=>{throw Error('Existing intent cannot be called absent');}),error=>error.code==='metadata_continuation_exists');
    await interrupt(input.reviewDatabase,null);await evidence('prepared');
    await interrupt(input.reviewDatabase,'current',3);await evidence('review');
    const partial=JSON.parse(observations.at(-1).review);assert.ok(partial.current.lanes.some(row=>row.relay.reviewReceipt));assert.ok(partial.current.lanes.some(row=>row.relay.reviewReceipt===null));
    await interrupt(input.metadataDatabase,'current',2);await evidence('metadata');
    result=await continueHeldRoomMetadata(scope,witness,runRequest({...input,expected,approve:()=>true}),true);await evidence('metadata');
    assert.deepEqual(result.choice,expected);await assertSourceBytesUnchanged(oldBytes);
   });
  }));
  saveEvidence(f.host.directory+'/metadata-continuation-pins-evidence.json',{passed:true,phases:observations.map(row=>row.phase),pinObservations,evidence:observations,actualFamilies:7,actualLocalMetadataLanes:3,noDestinationWritesDuringEvidence:true,allNamespaceLeasesHeld:true,partialReviewFactsPreserved:true,metadataAcknowledgementsPreserved:true,wholeRoomActivated:false});
  owner=attempt.takeOwner();assert.equal(owner.clients.length,7);for(const row of owner.clients){const old=prepared.f.clients.find(old=>old.id===row.id);assert.deepEqual(nativePair(row.core),old.pair);const doc=row.core.documentJson(),comments=row.core.reviewSnapshot().view;assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),doc);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');assert.deepEqual(row.core.reviewSnapshot().view,comments);}await assertSourceBytesUnchanged(oldBytes);
  await assertSourceBytesUnchanged(oldBytes);console.log('CONTINUATION_PINS_NATIVE '+JSON.stringify({phases:observations.map(row=>row.phase),actualFamilies:7,actualLocalMetadataLanes:3,noDestinationWritesDuringEvidence:true,allNamespaceLeasesHeld:true,exactFutureDocumentAndCommentHistories:true,wholeRoomActivated:false}));
 }catch(error){console.log('METADATA_CONTINUATION_FAILURE',error);throw error;}finally{inventory?.dispose();host?.close();currentHost?.close();await owner?.discardAndClose();await attempt?.close();await metadata?.close();await prepared?.close();await f?.close();}
});
