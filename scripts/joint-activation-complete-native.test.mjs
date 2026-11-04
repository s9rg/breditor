import {originalJointSourceBytes,assertOriginalSourceRetirement} from './fixtures/native-joint-source/source_checkpoint_bytes.mjs';
import {gzipSync} from 'node:zlib';
/** Complete warm joint owner against the actual Rust HTTP activation and
 * publication controls. Seven real cold clients retain fourteen unsent lanes,
 * real image ACKs and future native histories. Browser storage is controlled. */
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {join,dirname} from 'node:path';import {createHash} from 'node:crypto';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {testMetadataMaterialization} from './fixtures/local-metadata/materialization.mjs';
import {prepareColdJointSources} from './fixtures/local-metadata/cold-joint-sources.mjs';
import {nativePublicationPredecessorRoot} from './fixtures/native-publication/predecessor-root.mjs';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {prepareJointExecution} from './fixtures/native-publication/prepare-joint-execution.mjs';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {checkFutureNativeHistories} from './fixtures/local-metadata/future-native-histories.mjs';
import {PacketRasterFixtureImage} from './fixtures/local-metadata/packet-raster.mjs';
import {saveActualActivationIntent} from './fixtures/native-activation/intent-evidence.mjs';
import {JointRoomActivationAttempt as Joint,withJointRoomActivationSources as sourceWork,withPublishedJointRoomSources as publishedWork} from '../packages/breditor-collaboration/dist/native_room_joint_activation/attempt.js';
import {materializeSelectedSourceVersions} from '../packages/breditor-collaboration/dist/native_room_joint_activation/materialize_versions.js';
import {SharedDurableNativeActivationHost as Activation} from '../packages/breditor-collaboration/dist/native_activation_control/host.js';
import {SharedNativeRoomPublicationHost as Publication} from '../packages/breditor-collaboration/dist/native_publication_control/host.js';
import {SharedServerLogGenerationRecoveryHost as Host} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {SharedServerLogGenerationDeliveryRecoveryHost as DeliveryHost} from '../packages/breditor-collaboration/dist/generation_delivery_control/host.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../packages/breditor-collaboration/dist/server_generation_inventory/read.js';
import {SharedRelayAssets} from '../packages/breditor-collaboration/dist/index.js';
import {SelectedLocalReviewDelivery as Review} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {SelectedLocalMetadataDelivery as Metadata,previewSelectedLocalMetadataResume} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {previewMetadataContinuationPreparation,prepareMetadataContinuationDelivery} from '../packages/breditor-collaboration/dist/selected_delivery_preparation/coordinator.js';
import {independentHistoryNative} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(directory,name,value)=>{const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n'),file=join(directory,name);writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);return{file,bytes:bytes.length,sha256:sha(bytes)};};
test('actual joint activation retains actors and metadata until authenticated publication, then delivers all original protocols',{timeout:14400000},()=>testMetadataMaterialization('local-only-content',{reconcileAssets:true,cacheCatalogPackets:false,verifyFutureHistories:true,nativeHostRoot:nativePublicationPredecessorRoot,nativeHostFactory:(root,options)=>selectedDeliveryNativeHost(root,{...options,nativeActivation:true,nativePublication:true}),onRetainedReconciliation:async input=>{
 let joint,run,stage,activation,publication,transport,inspection,current,delivery,inventory,offer,metadataCase,activationChoice,continued,replacement,plan;
 let commitRequests=0,publicationRequests=0,normalAcquisitions=0,lostCommit,lostPublication,loseCommit=true,losePublication=true,handedBack=false;
 const fetch=globalThis.fetch,image=Object.getOwnPropertyDescriptor(globalThis,'Image'),acquireDocument=SharedWriterLease.acquire,acquireReview=ReviewWriterLease.acquire;
 Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});
 const held=async()=>{const descriptor=JSON.parse(input.fixture.inventoryJson);for(const client of input.fixture.clients){await assert.rejects(acquireDocument.call(SharedWriterLease,descriptor.room.document,client.writer),e=>e.code==='writer_in_use');await assert.rejects(acquireReview.call(ReviewWriterLease,descriptor.room.document,client.actor),e=>e.code==='review_writer_in_use');}};
 const noTake=()=>{assert.throws(()=>joint.takeOwner(),e=>e.code==='joint_activation_state'||e.code==='joint_activation_busy');assert.throws(()=>joint.publishedMetadata(),e=>e.code==='joint_activation_state'||e.code==='joint_activation_busy');};
 try{
  globalThis.fetch=async(url,options)=>{const address=String(url),commit=address.endsWith('/recovery/native-activation/v1/commit'),publish=address.endsWith('/recovery/native-publication/v1/publish');if(commit)commitRequests++;if(publish)publicationRequests++;const response=await fetch(url,options);if(commit&&loseCommit){loseCommit=false;assert.equal(response.status,200);lostCommit=JSON.parse(await response.text());throw Error('Test-owned lost actual joint Native commit reply');}if(publish&&losePublication){losePublication=false;assert.equal(response.status,200);lostPublication=JSON.parse(await response.text());throw Error('Test-owned lost actual joint publication reply');}return response;};
  stage=await prepareColdJointSources({...input,async materializeDependencies({scope,sources,metadata,check}){
   const before=await scope.retainCurrent(),bytes=Buffer.from(await before.current.file.arrayBuffer()),file=join(input.host.directory,'joint-before-version-materialization.archive');writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);const wire=input.requests.length;
   const result=await materializeSelectedSourceVersions(scope,metadata,{checkAuthority:check,async getToken(id,signal){const row=sources.find(row=>row.id===id),parent=row.source.parent;assert.notEqual(parent.kind,'independent-local');const source=parent.kind==='generation'?parent.source.session:parent.session,writer=source.reviewRelayIdentity().documentWriter,client=input.fixture.clients.find(row=>row.writer===writer);assert.ok(client);const auth=await input.host.authentication(client);return auth.getToken(signal);},approve(choice){assert.deepEqual(choice.before,before.current.selection);assert.equal(commitRequests,0);assert.equal(publicationRequests,0);save(input.host.directory,'joint-source-version-materialization-choice.json',choice);return true;}});
   check();assert.equal(input.requests.length,wire,'Body materialization cannot send document/comment/metadata publication frames');assert.ok(result.materialized>0);assert.equal(commitRequests,0);assert.equal(publicationRequests,0);save(input.host.directory,'joint-source-version-materialization.json',{choice:result.choice,materialized:result.materialized,before:{file,bytes:bytes.length,sha256:sha(bytes)},after:result.after.selection,actualNativeRequests:0,actualPublicationRequests:0,documentOrCommentFramesSubmitted:0});console.log('JOINT_COMPLETE_STEP actual-known-version-bodies-durable-before-final-reconstruction-cut');
  },async prepareReplacement(){run=await prepareJointExecution({...input,native},'actual-joint-complete');},async borrow(old,reads,visit){joint=Joint.begin(old,reads);await joint.ready();return sourceWork(joint,({scope,sources,check})=>visit(scope,sources,check));}});
  noTake();await held();const expected=new Map(stage.sources.map(row=>[row.id,{pair:nativePair(row.source.core),document:row.source.core.documentJson(),review:row.source.core.reviewSnapshot().view}]));
  console.log('JOINT_COMPLETE_STEP seven-cold-owners-and-fourteen-offline-lanes-held');
  await sourceWork(joint,async({scope,sources,check})=>{
   const first=input.host.initial,local=sources.find(row=>row.source.parent.kind==='independent-local'),identity=independentHistoryNative(local.source.parent.session).identity,client=input.fixture.clients.find(row=>row.writer===identity.native.writer&&row.actor===identity.review.actor),auth=await input.host.authentication(client);
   transport=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:client.principal,getToken:auth.getToken,store:{resolve(){throw Error('No joint recovery cache read');},cacheRemote(){throw Error('No joint recovery cache insertion');}}});
   activationChoice=await stage.metadata.prepareNativeActivation({database:'actual-joint-complete-native-intent',recovery:{host:stage.fresh.previous,inventory:stage.fresh.inventory,server:stage.fresh.server,transport},async selectActivation(source){offer=await input.host.prepareJointActivationAfter(source,input.host.initial);metadataCase=offer.case;assert.equal(metadataCase.previousSequence,input.host.initial.sequence);assert.deepEqual(metadataCase.selection.source,source);check();activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>input.host.activationToken(offer),checkAuthority:check,signal:scope.signal});
    // Publication has an independent operator lifetime. The joint coordinator
    // supplies its fresh target check/signal after old sources have retired.
    publication=Publication.configure({endpoint:offer.publication.endpoint,expected:offer.publication.selection,principal:'operator',getToken:()=>input.host.publicationToken(offer.publication),checkAuthority(){}});return activation;},retainChoice(value){assert.equal(commitRequests,0);assert.equal(publicationRequests,0);save(input.host.directory,'actual-joint-native-choice.json',value);}});
   const replay=await input.host.reconstruct(offer.case);inspection=await Host.open({endpoint:replay.endpoint,expected:replay.selection,principal:'operator',getToken:()=>input.host.operatorToken(replay),checkAuthority:check,signal:scope.signal});
  });
  // Preserve the complete real prepared graph before local descriptor
  // validation, so a refusal remains reproducible without another room run.
  const preparedEvidence=await sourceWork(joint,async()=>{assert.equal(commitRequests,0);assert.equal(publicationRequests,0);return saveActualActivationIntent(join(input.host.directory,'actual-joint-prepared-native-intent-evidence'),activationChoice);});
  save(input.host.directory,'actual-joint-prepared-association.json',{activation:activationChoice,execution:run.options.expected,publication:offer.publication.selection,destinations:{database:'actual-joint-complete-continuation',preparationDatabase:'actual-joint-complete-metadata-preparation',reviewDatabase:'actual-joint-complete-review',metadataDatabase:'actual-joint-complete-metadata'},preparedEvidence});
  plan=await joint.prepare({database:'actual-joint-complete-intent',metadata:stage.metadata,activation:activationChoice,execution:run.options.expected,publication,destinations:{database:'actual-joint-complete-continuation',preparationDatabase:'actual-joint-complete-metadata-preparation',reviewDatabase:'actual-joint-complete-review',metadataDatabase:'actual-joint-complete-metadata'},reads:run.reads,run:run.options,retainChoice(value){assert.equal(commitRequests,0);assert.equal(publicationRequests,0);noTake();save(input.host.directory,'actual-joint-complete-independent-plan.json',value);}});noTake();await held();
  console.log('JOINT_COMPLETE_STEP complete-joint-descriptor-retained-before-native-request');
  await assert.rejects(joint.commitNative({activation,inspection,approve:()=>false}));assert.equal(commitRequests,0);noTake();
  await assert.rejects(joint.commitNative({activation,inspection,approve:()=>true}),e=>e.code==='activation_outcome_unknown');assert.equal(commitRequests,1);noTake();await held();
  await sourceWork(joint,async()=>{const saved=await stage.metadata.readNativeActivationIntent(activationChoice);assert.equal(saved.state.phase,'request-started');assert.equal(saved.state.receipt,null);});
  const nativeResult=await joint.commitNative({activation,inspection,approve:()=>true});assert.equal(commitRequests,2);assert.deepEqual(nativeResult.receipt,lostCommit);noTake();
  const nativeEvidence=await saveActualActivationIntent(join(input.host.directory,'actual-joint-complete-native-intent-evidence'),activationChoice);
  console.log('JOINT_COMPLETE_STEP same-native-owner-confirmed-after-real-lost-reply');
  const beforeStop=originalJointSourceBytes(await sourceByteSnapshots(),plan.plan),recover={approveRetirement:()=>true,approveExecution:()=>true,approvePromotion:()=>true,checkAssetAuthority(){}};
  await assert.rejects(joint.recoverReplacement({...recover,approveRetirement:()=>false}));noTake();await held();
  // Retirement must first checkpoint actual enlisted journals. Permit only
  // that one canonical revision advance; no content/packet/receipt may change.
  // The original source namespaces then become immutable through all targets,
  // metadata continuation, publication and ordinary delivery. Outcome journals
  // and new destination stores are not original source data.
  const stopped=await assertOriginalSourceRetirement(beforeStop,plan.plan);assert.ok(stopped.checkpoints.every(row=>row.revisionDelta===1));const oldBytes=stopped.after;
  const checkpointFiles=[];for(const[name,rows]of [['before',beforeStop],['after',oldBytes]]){const bytes=Buffer.from(JSON.stringify([...rows]));assert.ok(bytes.length<=128*1024*1024);const encoded=gzipSync(bytes,{level:6}),path=join(input.host.directory,'joint-original-source-checkpoint-'+name+'.json.gz');writeFileSync(path,encoded,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(path),encoded);checkpointFiles.push({name,file:path,bytes:encoded.length,sha256:sha(encoded)});}
  save(input.host.directory,'joint-original-source-checkpoint.json',{format:'breditor/test-joint-source-checkpoint',formatVersion:1,checkpoints:stopped.checkpoints,sourceNamespaces:[...oldBytes.keys()],files:checkpointFiles,allOriginalContentAndFactsPreserved:true,allOtherOriginalBytesExact:true});
  console.log('JOINT_COMPLETE_STEP actual-source-checkpoint-preserves-all-content-and-facts');
  SharedWriterLease.acquire=async()=>{normalAcquisitions++;throw Error('No ordinary document writer acquisition during joint handoff');};ReviewWriterLease.acquire=async()=>{normalAcquisitions++;throw Error('No ordinary comment writer acquisition during joint handoff');};
  await assert.rejects(joint.recoverReplacement({...recover,approvePromotion:()=>false}));noTake();await joint.recoverReplacement(recover);noTake();assert.equal(normalAcquisitions,0);
  SharedWriterLease.acquire=acquireDocument;ReviewWriterLease.acquire=acquireReview;await held();await assertSourceBytesUnchanged(oldBytes);
  console.log('JOINT_COMPLETE_STEP all-fourteen-actors-transferred-without-reacquisition-target-private');
  // Provision new controls for the catalogue predecessor during Native
  // preparation. Old services close and new snapshots remain frozen. Reopen
  // authenticated wrappers here; the retained selection grants no authority.
  const actual=metadataCase;assert.ok(actual);current=await Host.open({endpoint:actual.endpoint,expected:actual.selection,principal:'operator',getToken:()=>input.host.operatorToken(actual),checkAuthority(){}});delivery=await DeliveryHost.open({endpoint:actual.deliveryEndpoint,expected:actual.deliverySelection,current,principal:'operator',getToken:()=>input.host.operatorToken(actual),checkAuthority(){}});inventory=await Inventory.read(new Blob([readFileSync(join(dirname(actual.path),'inventory.json'))]),actual.selection.source.participants);
  const metadataInput={host:delivery,inventory,checkAuthority(){},approve:()=>true};continued=await joint.continueMetadata(metadataInput);noTake();await held();await assertSourceBytesUnchanged(oldBytes);
  assert.deepEqual(plan.plan.origin.selection.current,continued.choice.origin.current);assert.equal(continued.choice.execution.database,plan.plan.execution.database);save(input.host.directory,'actual-joint-complete-continued-choice.json',continued.choice);
  console.log('JOINT_COMPLETE_STEP original-metadata-continued-before-normal-service-publication');
  await assert.rejects(joint.publish({...metadataInput,approvePublication:()=>false}));assert.equal(publicationRequests,0);noTake();
  await assert.rejects(joint.publish({...metadataInput,approvePublication:()=>true}),e=>e.code==='publication_outcome_unknown');assert.equal(publicationRequests,1);noTake();await held();
  const published=await joint.publish({...metadataInput,approvePublication:()=>true});assert.equal(publicationRequests,2);assert.deepEqual(published,lostPublication);await input.host.observePublication(offer);await assertSourceBytesUnchanged(oldBytes);
  console.log('JOINT_COMPLETE_STEP actual-publication-confirmed-after-real-lost-reply');
  const prior=continued;continued=joint.publishedMetadata();assert.deepEqual(continued.choice,prior.choice);assert.notEqual(await continued.current.parent.delivery.file.text(),await prior.current.parent.delivery.file.text());
  await publishedWork(joint,async({scope,sources,check})=>{
   let gate,review,metadata;
   try{for(const row of sources){const old=expected.get(row.id);assert.deepEqual(nativePair(row.source.core),old.pair);assert.equal(row.source.core.documentJson(),old.document);assert.deepEqual(row.source.core.reviewSnapshot().view,old.review);}const prepared=await previewMetadataContinuationPreparation(scope,delivery,inventory,'actual-joint-complete-final-delivery-preparation');gate=await prepareMetadataContinuationDelivery(scope,delivery,inventory,prepared.choice);review=await Review.reopen(scope,gate,continued.current.parent,{expected:continued.choice.review,approve:()=>true,checkAuthority:check});const inputMetadata={choice:continued.choice.metadata,bundle:continued.current,checkAuthority:check},selected=await previewSelectedLocalMetadataResume(review,inputMetadata);metadata=await Metadata.reopen(review,{...inputMetadata,expected:selected,approve:()=>true});const delivered=await stage.settle({scope,sources,metadata,review,host:input.host,fixture:input.fixture,deliveryChoice:continued.choice.metadata,adapters:input.adapters,contexts:input.contexts,cacheCatalogPackets:false});assert.equal(delivered.length,14);continued={...continued,current:await metadata.capture()};}
   finally{await metadata?.close();await review?.close();await gate?.close();}
  });
  replacement=joint.takeOwner();assert.equal(replacement.clients.length,7);
  const chosenAssets=JSON.parse(readFileSync(join(input.host.directory,'joint-execution-asset-decisions.json'))),assetFields=['asset','mime','bytes','width','height','status','attempts','storageRef','failure'],expectedAssets=new Map();for(const edge of ['union','adoption'])for(const row of chosenAssets.observed.filter(row=>row.edge===edge))expectedAssets.set(JSON.stringify([row.id,row.conflict.asset]),{id:row.id,asset:row.conflict.asset,expected:row.actual});
  const finalAssetStates=[];for(const row of expectedAssets.values()){const info=await replacement.assets(row.id).get(row.asset);assert.ok(info);const actual=Object.fromEntries(assetFields.map(key=>[key,info[key]]));assert.deepEqual(actual,row.expected,'Every selected asset field must survive reconstruction and delivery');finalAssetStates.push({...row,actual});}assert.ok(finalAssetStates.length>0);save(input.host.directory,'joint-final-asset-states.json',{format:'breditor/test-joint-final-asset-states',formatVersion:1,fields:assetFields,rows:finalAssetStates});
  for(const row of replacement.clients){assert.ok(expected.has(row.id));const info=await replacement.assets(row.id).get(input.remoteAsset);if(info)assert.equal(info.status,'uploaded');}checkFutureNativeHistories(replacement.clients);await assertSourceBytesUnchanged(oldBytes);
  // The surrounding fixture now observes the actual returned replacement; its
  // original closure still cleans only its retired sources. No owner is faked.
  const close=input.session.close;Object.defineProperty(input.session,'owner',{configurable:true,get:()=>replacement});input.session.close=async()=>{await replacement?.discardAndClose();await close();};handedBack=true;
  const report={format:'breditor/joint-complete-native-observation',formatVersion:1,actualNativeParticipants:7,actualTransferredActors:14,retainedOfflineLanes:14,actualLocalMetadataLanes:3,actualNativeRequests:commitRequests,actualPublicationRequests:publicationRequests,normalWriterAcquisitions:normalAcquisitions,lostNativeReplyConfirmedBySameOwner:true,lostPublicationReplyConfirmedBySameOwner:true,independentPlanBeforeAllRequests:true,metadataContinuedBeforePublication:true,originalSourceContentPreserved:true,originalSourcesImmutableAfterCheckpoint:true,finalSelectedAssetStatesVerified:finalAssetStates.length,originalProtocolDeliveries:14,exactFutureDocumentAndCommentHistories:true,nativeEvidence,plan:{bytes:plan.bytes,sha256:plan.sha256},warmJointWorkflow:true,physicalDurabilityQualified:false,coldJointOwnerReconstructionQualified:false};console.log('JOINT_COMPLETE_NATIVE '+JSON.stringify(save(input.host.directory,'actual-joint-complete-observation.json',report)));
 }finally{SharedWriterLease.acquire=acquireDocument;ReviewWriterLease.acquire=acquireReview;globalThis.fetch=fetch;inspection?.close();delivery?.close();current?.close();activation?.close();publication?.close();transport?.dispose();stage?.fresh?.close();if(replacement&&!handedBack)await replacement.discardAndClose();await joint?.close();await run?.close();if(image)Object.defineProperty(globalThis,'Image',image);else delete globalThis.Image;}
}}));
