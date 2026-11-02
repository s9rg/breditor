import {testCoordinatedNativeActivation} from './fixtures/native-activation/coordinated.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeActivationRoot} from './fixtures/native-activation/native-root.mjs';
import {saveActualActivationIntent} from './fixtures/native-activation/intent-evidence.mjs';
import {readHeldRoomActivation} from '../packages/breditor-collaboration/dist/room_native_activation_intent/commit.js';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {join} from 'node:path';
/** Actual lost Rust commit reply across separate persistent-source commands,
 * durable suspension and cold reopening. No ACK or native receipt is invented. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {actualLocalReviewSession} from './fixtures/selected-delivery/local-review-session.mjs';
import {localReviewRaw} from './fixtures/selected-delivery/local-review-evidence.mjs';
import {NativeActivationSourceSession as Session,withNativeActivationSources as work} from '../packages/breditor-collaboration/dist/native_room_joint_activation/source_session.js';
import {SelectedLocalMetadataDelivery as Metadata,previewSelectedLocalMetadataDelivery} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {metadataBinding} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/policy.js';
import {emptyDeliveryRetainedRecords} from '../packages/breditor-collaboration/dist/delivery_state/retained.js';
import {independentHistoryNative} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
test('actual lost Native commit reply remains uncertain across commands and durable source suspension',{timeout:7200000},async()=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 const root=new URL('../',import.meta.url).pathname,seeds=new Map(),tag='native-joint-actual-unknown';let f,source,metadata,choice,before,activationChoice,offer,intentEvidence;
 const seed=async actual=>{const identity=independentHistoryNative(actual).identity,draft=text=>({scope:'commands',edit:{kind:'commands',data:[{kind:'insert_text',data:{block:'p',offset:0,text}}]}}),packet=actual.core.captureSuggestion('Pending proposal',identity.review.principal,'20',draft('Original proposal ')),revision=actual.core.captureSuggestionRevision(packet,'Pending revision','21',draft('Revised proposal ')),version=actual.versionPacket(actual.versions()[0].id);seeds.set(identity.native.writer,{packet,revision,version});};
 try{f=await actualLocalReviewSession(root,tag,{deferDelivery:true,leaveOpen:true,prepareLocalInput:seed,releaseBorrow:()=>source?.close(),hostFactory:value=>selectedDeliveryNativeHost(nativeActivationRoot(value),{suggestionGrants:true,nativeActivation:true}),
  borrow:async(old,reads,visit)=>{source=Session.begin(old,reads);await source.ready();return work(source,({scope,sources,check})=>visit(scope,sources,check));},
  onReady:async({scope,sources,review,choice:parent,fixture,check})=>{
   console.log('JOINT_METADATA_STEP genuine-parent-ready');
   const descriptor=JSON.parse(fixture.inventoryJson),lanes=parent.lanes.map(row=>{const packets=seeds.get(row.source.native.writer);assert.ok(packets);const binding=metadataBinding({suggestions:{identity:{endpoint:row.binding.endpoint,principal:row.binding.principal,room:row.binding.room,documentWriter:row.binding.documentWriter,effectWriter:descriptor.serverAuthors.find(author=>author.kind==='suggestionEffect').clock.writer,binding:descriptor.suggestionsBinding,writerTransport:'atomic-v2'},ownedHistory:null},revisions:{binding:descriptor.revisionsBinding},versions:{endpoint:row.binding.endpoint,principal:row.binding.principal,room:row.binding.room,documentWriter:row.binding.documentWriter,binding:descriptor.versionsBinding,writerTransport:'atomic-v2'}},row),records=emptyDeliveryRetainedRecords(binding);records.suggestions.retained=[{packet:packets.packet,origin:'local',publish:true,publication:null,intent:null,decision:null}];records.revisions.retained=[{previousPacket:packets.packet,packet:packets.revision,retry:true,receipt:null,conflict:null}];records.versions.packets=[{packet:packets.version,origin:'local',publish:true,accepted:null}];return{id:row.id,binding,records};});
   choice=await previewSelectedLocalMetadataDelivery(review,{database:tag+'-metadata',lanes});metadata=await Metadata.open(review,{expected:choice,lanes,approve:()=>true,checkAuthority:check});console.log('JOINT_METADATA_STEP genuine-metadata-open');for(const row of sources.filter(row=>row.source.parent.kind==='independent-local')){const context=metadata.createDelivery(row.source,'comment'),children=await metadata.prepare(row.source,context);assert.ok(children.versions);assert.ok(children.suggestions);assert.ok(children.revisions);}before=metadata.recovery();assert.equal(lanes.length,3);
  }});
  const expected=new Map(f.session.owner.clients.map(row=>[row.id,{pair:nativePair(row.core),document:row.core.documentJson(),review:row.core.reviewSnapshot().view}])),cores=f.session.owner.clients.map(row=>row.core),basis=(await source.capture()).current;
  await assert.rejects(work(source,held=>testCoordinatedNativeActivation({...held,metadata,host:f.host,onUnknown:async actual=>{activationChoice=actual.choice;offer=actual.offer;assert.equal(actual.commitRequests,1);intentEvidence=await saveActualActivationIntent(join(f.host.directory,'persistent-source-unknown-intent'),activationChoice);throw Error('Test-owned command boundary after genuine unknown Native commit');}})),/command boundary after genuine unknown Native commit/);
  for(const core of cores)assert.throws(()=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'must remain held'}}]}),e=>e.code==='native_recovery_busy');
  const records=state=>state.lanes.map(row=>({id:row.id,records:row.records})),originalRecords=records(before.current),heldUnknown=await work(source,async()=>metadata.readNativeActivationIntent(activationChoice));assert.equal(heldUnknown.state.phase,'request-started');assert.equal(heldUnknown.state.receipt,null);assert.deepEqual(records(metadata.recovery().current),originalRecords);
  await source.suspend();for(const core of cores)assert.throws(()=>core.undo(),e=>e.code==='retired'||e.code==='disposed');
  const durableMetadata=await localReviewRaw(choice.database);assert.deepEqual(records(JSON.parse(durableMetadata.current)),originalRecords);
  const closedUnknown=await readHeldRoomActivation(activationChoice,{wasm:native,checkAuthority(){}});assert.deepEqual(closedUnknown.state,heldUnknown.state);
  const descriptor=JSON.parse(f.fixture.inventoryJson);for(const client of f.fixture.clients){await assert.rejects(SharedWriterLease.acquire(descriptor.room.document,client.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(descriptor.room.document,client.actor),e=>e.code==='review_writer_in_use');}
  await source.close();await f.host.finishActivation(offer);await f.session.cold(basis);
  for(const row of f.session.owner.clients){const old=expected.get(row.id);assert.deepEqual(nativePair(row.core),old.pair);assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),old.document);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');assert.deepEqual(row.core.reviewSnapshot().view,old.review);}
  const coldUnknown=await readHeldRoomActivation(activationChoice,{wasm:native,checkAuthority(){}});assert.deepEqual(coldUnknown.state,heldUnknown.state);assert.deepEqual(await localReviewRaw(choice.database),durableMetadata);
  saveEvidence(f.host.directory+'/persistent-source-unknown.json',{passed:true,actualNativeSources:7,actualLocalLanes:3,actualCommitRequestsBeforeBoundary:1,unknownRetainedAcrossSeparateCommands:true,sourceExclusionKeptAfterRealUnknown:true,unknownRetainedAfterDurableSuspensionAndColdReopen:true,actualActorLocks:14,coldExactFutureDocumentAndCommentHistories:true,pendingMetadataPacketsUnchanged:true,intentEvidence,wholeRoomActivated:false});

 }catch(error){console.log('JOINT_METADATA_ORIGINAL_FAILURE',error);throw error;}finally{const errors=[];for(const action of[()=>metadata?.close(),()=>source?.close(),()=>f?.close()])try{await action();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Joint metadata test cleanup did not finish');}
});
