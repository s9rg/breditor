/** Genuine seven-family metadata reservation -> inactive successor -> SDK HTTP
 * activation. Native service, intent state and normal ACKs remain separate. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {SharedDurableNativeActivationHost as Activation,SharedServerLogGenerationRecoveryHost as Inspection} from '../../../packages/breditor-collaboration/dist/index.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
import {handoverControls} from '../selected-delivery/cold-continuation.mjs';
import {saveActualActivationIntent} from './intent-evidence.mjs';
import {
 assertHandoverPublicationWaiting,
 handoverPublicationRequester,
 retainHandoverPublicationAssociation,
 publishHandoverService,
} from '../native-publication/sealed-handover.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function testCoordinatedHandoverNativeActivation({scope,sources,metadata,host,check,pending}){
 const stamps=sources.map(row=>coreReadStamp(row.source.core)),before=metadata.recovery().current.lanes;
 const unchanged=()=>{check();scope.check();assert.deepEqual(metadata.recovery().current.lanes,before);assert.deepEqual(sources.map(row=>coreReadStamp(row.source.core)),stamps);};
 const fetch=globalThis.fetch;let current,activation,inspection,publication,expected,lostReceipt,requests=0,approvals=0;let lose=true;
 const rejection=code=>error=>{if(error.code!==code)console.error('SDK_HANDOVER_ACTIVATION_UNEXPECTED '+JSON.stringify({expected:code,actual:error.code,stack:error.stack}));return error.code===code;};
 try{
  current=await handoverControls(host,await host.refresh(),scope);unchanged();
  const offer=host.handoverActivationOffer();assert.deepEqual(offer.selection.current,current.actual.selection.source);
  await assertHandoverPublicationWaiting(host,offer);
  activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>host.activationToken(offer),checkAuthority:()=>{scope.check();check();},signal:scope.signal});
  globalThis.fetch=async(url,options)=>{
   const commit=String(url).endsWith('/recovery/native-activation/v1/commit');if(commit)requests++;
   const response=await fetch(url,options);
   if(commit&&lose){lose=false;assert.equal(response.status,200);lostReceipt=JSON.parse(await response.text());throw Error('Controlled lost reply after actual handover target activation');}
   return response;
  };
  console.log('SDK_HANDOVER_ACTIVATION_STEP capture-inactive-target-before-any-native-request');
  expected=await metadata.prepareNativeActivationAcrossHandover({
   database:'actual-sdk-handover-native-activation-intent',
   recovery:{host:current.delivery,path:current.path,server:current.server,inventory:current.inventory,transport:current.delivery},activation,
   retainChoice(choice){
    assert.equal(requests,0);assert.deepEqual(choice.handover,current.path.handoverSelection());
    const bytes=Buffer.from(JSON.stringify(choice)),path=join(host.directory,'sdk-handover-activation-independent-choice.json');writeFileSync(path,bytes,{flag:'wx',mode:0o600});assert.ok(readFileSync(path).equals(bytes));
   },
  });unchanged();assert.equal(requests,0);
  const retained=await metadata.readNativeHandoverActivationIntent(expected);unchanged();
  assert.equal(retained.state.phase,'prepared');assert.equal(retained.state.receipt,null);assert.deepEqual(retained.choice,expected);assert.deepEqual(retained.capture.handover,current.path.handoverSelection());
  assert.equal(retained.capture.capture.recovery.kind,'retained');assert.equal(retained.capture.capture.recovery.bundle.assets.kind,'retained');
  assert.equal(pending.pending.filter(row=>row.kind==='original'&&row.requirement.kind==='head').length,14);
  assert.equal(retained.capture.capture.reconciliation.pending.filter(row=>row.kind==='original'&&row.requirement.kind==='head').length,14);
  assert.equal(requests,0);await assertHandoverPublicationWaiting(host,offer);
  console.log('SDK_HANDOVER_ACTIVATION_STEP complete-intent-cold-readback-before-approval');
  const historical=await host.reconstruct(current.actual);
  inspection=await Inspection.open({endpoint:historical.endpoint,expected:historical.selection,principal:'operator',getToken:()=>host.operatorToken(historical),checkAuthority:()=>{scope.check();check();},signal:scope.signal});
  const input={expected,activation,path:current.path,inspection};
  await assert.rejects(metadata.commitNativeActivationAcrossHandover({...input,approve(){approvals++;return false;}}),rejection('activation_intent_policy'));unchanged();assert.equal(requests,0);assert.equal(approvals,1);
  console.log('SDK_HANDOVER_ACTIVATION_STEP fresh-native-inspection-then-authenticated-sdk-request');
  await assert.rejects(metadata.commitNativeActivationAcrossHandover({...input,approve(){approvals++;return true;}}),rejection('activation_outcome_unknown'));unchanged();assert.equal(requests,1);
  const unknown=await metadata.readNativeHandoverActivationIntent(expected);unchanged();assert.equal(unknown.state.phase,'request-started');assert.equal(unknown.state.receipt,null);
  console.log('SDK_HANDOVER_ACTIVATION_STEP committed-native-reply-lost-original-intent-stays-unknown');
  const result=await metadata.commitNativeActivationAcrossHandover({...input,approve(choice){approvals++;assert.deepEqual(choice,expected);return true;}});unchanged();
  assert.equal(requests,2);assert.equal(approvals,3);assert.deepEqual(result.receipt,lostReceipt);assert.deepEqual(result.intent,expected);
  const observed=await metadata.readNativeHandoverActivationIntent(expected);unchanged();assert.equal(observed.state.phase,'receipt-observed');assert.deepEqual(observed.state.receipt,result.receipt);
  const repeat=await metadata.commitNativeActivationAcrossHandover({...input,approve(){approvals++;return true;}});unchanged();assert.deepEqual(repeat.receipt,result.receipt);assert.equal(requests,3);assert.equal(approvals,4);
  const disk=await saveActualActivationIntent(join(host.directory,'sdk-handover-native-activation-intent'),expected);unchanged();
  publication=handoverPublicationRequester(host,offer,unchanged,scope.signal);
  const association=retainHandoverPublicationAssociation(host,offer,expected);
  const published=await publishHandoverService(host,offer,publication,association,unchanged);
  const report={
   format:'breditor/sdk-handover-native-activation-observation',formatVersion:1,
   directory:host.directory,participants:7,retainedOfflineLanes:14,metadataSources:3,
   actualInactiveTargetBeforeIntent:true,preparedBeforeRequests:true,fullIntentReadback:true,disk,
   approvalRefusalWithoutRequest:true,lostActualCommitReplyRemainedUnknown:true,actualCommitRequests:requests,
   exactNativeReceipt:true,repeatReceiptUnchanged:true,actualNativeServiceResumed:true,actualDurableEpochObserved:true,
   nativeStampsUnchanged:true,metadataUnchanged:true,handoverPreserved:true,
   actualPublicationRequests:published.requests,lostPublicationReplyRetriedAgainstSameOwner:true,
   publicationAssociation:{file:association.file,bytes:association.pin.bytes,sha256:association.sha256},
   nativeObservation:published.nativeObservation,wholeRoomActivated:false,
  };
  const file=join(host.directory,'sdk-handover-native-activation-observation.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.ok(readFileSync(file).equals(bytes));
  console.log('SDK_HANDOVER_ACTIVATION_NATIVE '+JSON.stringify({file,sha256:sha(bytes),...report}));
 }catch(error){
  if(expected)try{const disk=await saveActualActivationIntent(join(host.directory,'sdk-handover-activation-failed-intent'),expected);console.error('SDK_HANDOVER_ACTIVATION_FAILED_INTENT '+JSON.stringify(disk));}catch(cause){console.error('SDK_HANDOVER_ACTIVATION_FAILED_INTENT_UNAVAILABLE '+JSON.stringify({code:cause.code,name:cause.name}));}
  throw error;
 }finally{globalThis.fetch=fetch;inspection?.close();publication?.close();activation?.close();current?.close();}
}
