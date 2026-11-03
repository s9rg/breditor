/** A real SDK request commits the prepared native epoch. Intent bytes and
 * receipts remain distinct from ACKs or whole-room readiness. */
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {SharedNativeRoomPublicationHost as Publication} from '../../../packages/breditor-collaboration/dist/native_publication_control/host.js';
import {SharedDurableNativeActivationHost as Activation,SharedServerLogGenerationRecoveryHost as Inspection,SharedRelayAssets} from '../../../packages/breditor-collaboration/dist/index.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
import {independentHistoryNative} from '../../../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {controls} from '../selected-delivery/cold-continuation.mjs';
import {saveActualActivationIntent} from '../native-activation/intent-evidence.mjs';
import {PacketRasterFixtureImage} from '../local-metadata/packet-raster.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function testCoordinatedNativePublication({scope,sources,metadata,host,check,pending,onUnknown}){
 const first=host.initial,fixture=host.fixture(first),stamps=new Map(sources.map(row=>[row.id,coreReadStamp(row.source.core)])),before=metadata.recovery().current.lanes;
 const unchanged=()=>{scope.check();check();assert.deepEqual(metadata.recovery().current.lanes,before);for(const row of sources)assert.deepEqual(coreReadStamp(row.source.core),stamps.get(row.id));};
 const image=Object.getOwnPropertyDescriptor(globalThis,'Image');Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});
 let current,transport,activation,publication,reader,offer,choice;let publicationRequests=0,losePublicationReply=true,publishedReceipt;let commitRequests=0,approvalCalls=0,cacheCalls=0,lostReceipt;let loseReply=true;
 const fetch=globalThis.fetch;
 try{
  current=await controls(host,first,scope);unchanged();
  const source=sources.find(row=>row.source.parent.kind==='independent-local'),identity=independentHistoryNative(source.source.parent.session).identity;
  const client=fixture.clients.find(row=>row.writer===identity.native.writer&&row.actor===identity.review.actor);assert.ok(client);
  const auth=await host.authentication(client);
  transport=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:client.principal,getToken:auth.getToken,store:{resolve(){cacheCalls++;throw Error('No recovery cache lookup');},cacheRemote(){cacheCalls++;throw Error('No recovery cache insertion');}}});
  globalThis.fetch=async(url,options)=>{const commit=String(url).endsWith('/recovery/native-activation/v1/commit');if(commit)commitRequests++;const response=await fetch(url,options);if(String(url).endsWith('/recovery/native-publication/v1/publish')){publicationRequests++;if(losePublicationReply){losePublicationReply=false;assert.equal(response.status,200);publishedReceipt=JSON.parse(await response.text());throw Error('Controlled lost reply after actual normal publication');}}if(commit&&loseReply){loseReply=false;assert.equal(response.status,200);lostReceipt=JSON.parse(await response.text());throw Error('Controlled lost reply after actual Native commit');}return response;};
  console.log('SDK_NATIVE_ACTIVATION_STEP capture-and-retain-before-request');
  choice=await metadata.prepareNativeActivation({database:'actual-native-activation-intent',recovery:{host:current.previous,inventory:current.inventory,server:current.server,transport},
   async selectActivation(source){
    assert.equal(commitRequests,0);offer=await host.prepareJointActivation(source);unchanged();
    activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>host.activationToken(offer),checkAuthority:unchanged,signal:scope.signal});
    publication=Publication.configure({endpoint:offer.publication.endpoint,expected:offer.publication.selection,principal:'operator',getToken:()=>host.publicationToken(offer.publication),checkAuthority:unchanged,signal:scope.signal});
    await assert.rejects(host.observePublication(offer),/actual-native-publication-not-observed/);
    await assert.rejects(host.finishActivation(offer),/no finish IPC/);
    return activation;
   },retainChoice(value){assert.equal(commitRequests,0);choice=value;const bytes=Buffer.from(JSON.stringify(value));const file=join(host.directory,'sdk-activation-independent-choice.json');writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);}});
  unchanged();assert.equal(commitRequests,0);
  const retained=await metadata.readNativeActivationIntent(choice);unchanged();assert.deepEqual(retained.choice,choice);assert.equal(retained.state.phase,'prepared');assert.equal(retained.state.receipt,null);
  assert.equal(retained.capture.recovery.kind,'retained');assert.equal(retained.capture.recovery.bundle.assets.kind,'retained');assert.equal(retained.capture.reconciliation.original.kind,'pending');
  if(pending){assert.equal(pending.pending.filter(row=>row.kind==='original'&&row.requirement.kind==='head').length,14);assert.equal(retained.capture.reconciliation.pending.filter(row=>row.kind==='original'&&row.requirement.kind==='head').length,14);}
  assert.deepEqual(choice.activation.current,offer.selection.current);assert.equal(BigInt(choice.activation.planned.generation),BigInt(choice.activation.previous.generation)+1n);assert.equal(cacheCalls,0);
  const replay=await host.reconstruct(offer.case);reader=await Inspection.open({endpoint:replay.endpoint,expected:replay.selection,principal:'operator',getToken:()=>host.operatorToken(replay),checkAuthority:unchanged,signal:scope.signal});
  await assert.rejects(metadata.commitNativeActivation({expected:choice,activation,inspection:reader,approve(){approvalCalls++;return false;}}),e=>e.code==='activation_intent_policy');unchanged();assert.equal(commitRequests,0);assert.equal(approvalCalls,1);
  console.log('SDK_NATIVE_ACTIVATION_STEP genuine-inspection-and-sdk-http-commit');
  await assert.rejects(metadata.commitNativeActivation({expected:choice,activation,inspection:reader,approve(){approvalCalls++;return true;}}),e=>e.code==='activation_outcome_unknown');unchanged();assert.equal(commitRequests,1);
  const unknown=await metadata.readNativeActivationIntent(choice);unchanged();assert.equal(unknown.state.phase,'request-started');assert.equal(unknown.state.receipt,null);
  console.log('SDK_NATIVE_ACTIVATION_STEP actual-native-commit-lost-reply-remains-unknown');
  if(onUnknown)await onUnknown({choice,unknown,offer,commitRequests,approvalCalls});
  const result=await metadata.commitNativeActivation({expected:choice,activation,inspection:reader,approve(actual){approvalCalls++;assert.deepEqual(actual,choice);return true;}});unchanged();assert.equal(commitRequests,2);assert.equal(approvalCalls,3);assert.deepEqual(result.receipt,lostReceipt);
  assert.equal(result.scope,'held-client-metadata-upload-cut-and-actual-native-service');assert.deepEqual(result.receipt.selection,choice.activation);
  const observed=await metadata.readNativeActivationIntent(choice);unchanged();assert.equal(observed.state.phase,'receipt-observed');assert.deepEqual(observed.state.receipt,result.receipt);
  const repeated=await metadata.commitNativeActivation({expected:choice,activation,inspection:reader,approve(){approvalCalls++;return true;}});unchanged();assert.deepEqual(repeated.receipt,result.receipt);assert.equal(commitRequests,3);
  const disk=await saveActualActivationIntent(join(host.directory,'sdk-native-activation-intent'),choice);unchanged();
  // This tests the low-level authenticated publication transport. The full
  // joint local actor/metadata coordinator remains a separate implementation.
  const descriptor={format:'breditor/test-native-service-publication-association',formatVersion:1,activation:choice,publication:offer.publication.selection},descriptorBytes=Buffer.from(JSON.stringify(descriptor)),descriptorFile=join(host.directory,'sdk-native-publication-independent-descriptor.json');writeFileSync(descriptorFile,descriptorBytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(descriptorFile),descriptorBytes);const joint={bytes:descriptorBytes.length,sha256:[...createHash('sha256').update(descriptorBytes).digest()]};
  console.log('SDK_NATIVE_PUBLICATION_STEP complete-association-retained-before-http');
  await assert.rejects(publication.publish(joint),e=>e.code==='publication_outcome_unknown');unchanged();assert.equal(publicationRequests,1);
  const publicationReceipt=await publication.publish(joint);unchanged();assert.equal(publicationRequests,2);assert.deepEqual(publicationReceipt,publishedReceipt);assert.equal(publicationReceipt.scope,'actual-held-native-service-and-bound-listener; joint-association-only');
  assert.deepEqual(await publication.publish(joint),publicationReceipt);unchanged();assert.equal(publicationRequests,3);
  const served=await host.observePublication(offer);unchanged();assert.deepEqual(served.selection.source,offer.selection.current);
  const nativeFile=join(host.directory,'language-3-standard-true-atomic-true','sdk-native-publication-'+offer.case.sequence+'-observed.json'),nativeBytes=readFileSync(nativeFile),nativeObservation=JSON.parse(nativeBytes);assert.equal(nativeObservation.normalServingStartedByAuthenticatedHttp,true);assert.equal(nativeObservation.observerStartedNormalServing,false);assert.deepEqual(nativeObservation.receipt,publicationReceipt);assert.deepEqual(nativeObservation.actualDeployment,choice.activation.planned);assert.equal(nativeObservation.wholeRoomActivated,false);
  const report={format:'breditor/sdk-native-publication-observation',formatVersion:1,participants:7,metadataSources:3,retainedOfflineLanes:pending?14:0,originalPending:retained.capture.reconciliation.original.kind,preparedBeforeRequests:true,fullIntentReadback:true,disk,lostActualCommitReplyRemainedUnknown:true,approvalRefusalWithoutRequest:true,actualCommitRequests:commitRequests,exactNativeReceipt:true,repeatReceiptUnchanged:true,actualNativeServiceResumed:true,actualPublicationRequests:publicationRequests,lostPublicationReplyRetriedAgainstSameOwner:true,observerDidNotStartNormalServing:true,publicationDescriptor:{bytes:descriptorBytes.length,sha256:sha(descriptorBytes)},actualDurableEpochObserved:true,nativeObservation:{file:nativeFile,bytes:nativeBytes.length,sha256:sha(nativeBytes)},nativeStampsUnchanged:true,metadataUnchanged:true,cacheCalls,choiceSha256:sha(JSON.stringify(choice)),wholeRoomActivated:false};
  const file=join(host.directory,'sdk-native-publication-observation.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);console.log('SDK_NATIVE_ACTIVATION_NATIVE '+JSON.stringify({file,sha256:sha(bytes),...report}));
 }finally{globalThis.fetch=fetch;reader?.close();activation?.close();publication?.close();transport?.dispose();current?.close();if(image)Object.defineProperty(globalThis,'Image',image);else delete globalThis.Image;}
}
