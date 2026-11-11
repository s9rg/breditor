/** Actual sealed relay process recovery with independently retained cuts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {SharedDurableNativeActivationHost as Activation} from '../packages/breditor-collaboration/dist/index.js';
import {assertHandoverPathContinuation} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/capture_binding.js';
import {selectedDeliveryNativeHost,reopenSelectedDeliverySealedNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeHandoverActivationRoot} from './fixtures/native-activation/handover-root.mjs';
import {handoverControls} from './fixtures/selected-delivery/cold-continuation.mjs';
import {
 assertHandoverPublicationWaiting,handoverPublicationRequester,
 retainHandoverPublicationAssociation,publishHandoverService,
} from './fixtures/native-publication/sealed-handover.mjs';

const selectActivation=(host,offer)=>Activation.configure({
 endpoint:offer.endpoint,expected:offer.selection,principal:'operator',
 getToken:()=>host.activationToken(offer),checkAuthority(){},
});

for(const committed of [false,true]){
 test('two fresh processes reopen sealed '+(committed?'committed':'prepared')+' checkpoints before authenticated publication',{timeout:600000},async()=>{
  await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
  const root=nativeHandoverActivationRoot(new URL('../',import.meta.url).pathname);
  const request=globalThis.fetch;
  globalThis.fetch=(url,options={})=>{
   const headers=new Headers(options.headers);
   headers.set('Origin','http://127.0.0.1:4187');
   return request(url,{...options,headers});
  };
  let host,activation,publication,readers,exited=false;
  try{
   host=await selectedDeliveryNativeHost(root,{nativeActivation:true,nativeHandoverActivation:true,nativeHandoverPublication:true,sealedProcessRecovery:true,suggestionGrants:true});
   const client=host.fixture(host.initial).clients[0];
   await host.handover();
   let offer=host.handoverActivationOffer();
   const originalCut=await host.refresh(),processIds=new Set([host.processId]);
   let selected=originalCut;
   for(let restart=0;restart<2;restart++){
    const previous=offer,oldAuth=await host.authentication(client);
    await assertHandoverPublicationWaiting(host,previous);
    if(committed){
     activation=selectActivation(host,previous);
     assert.deepEqual((await activation.commit()).selection,previous.selection);
     activation.close();
     activation=undefined;
    }
    const capsule=await host.prepareProcessRecovery(previous);
    const exitedProcess=await host.crashForRecovery(capsule);
    exited=true;
    assert.equal(exitedProcess.signal,'SIGKILL');
    assert.ok(processIds.has(exitedProcess.processId));
    host=await reopenSelectedDeliverySealedNativeHost(root,capsule);
    exited=false;
    assert.equal(processIds.has(host.processId),false);
    processIds.add(host.processId);
    offer=host.reopenedOffer;
    assert.equal(offer,host.handoverActivationOffer());
    assert.deepEqual(offer.selection.current,previous.selection.current);
    assert.notEqual(offer.selection.instance,previous.selection.instance);
    assert.notEqual(offer.publication.selection.instance,previous.publication.selection.instance);
    assert.equal(offer.publication.selection.listener,previous.publication.selection.listener);
    assert.notEqual(offer.case.handoverSelection.current.instance,selected.handoverSelection.current.instance);
    assertHandoverPathContinuation(selected.handoverSelection,offer.case.handoverSelection);
    if(committed){
     assert.deepEqual(offer.selection.previous,previous.selection.planned);
     assert.equal(BigInt(offer.selection.planned.generation),BigInt(previous.selection.planned.generation)+1n);
     assert.notDeepEqual(offer.selection.checkpointSha256,previous.selection.checkpointSha256);
    }else{
     assert.deepEqual(offer.selection.previous,previous.selection.previous);
     assert.deepEqual(offer.selection.planned,previous.selection.planned);
     assert.deepEqual(offer.selection.checkpointSha256,previous.selection.checkpointSha256);
    }
    const freshAuth=await host.authentication(client);
    assert.ok(freshAuth.getToken()!==oldAuth.getToken(),'The reopened process issues a fresh account token');
    assert.equal(offer.case.nativeProtectedStreamsVerified,true);
    selected=offer.case;
   }
   await assertHandoverPublicationWaiting(host,offer);
   readers=await handoverControls(host,offer.case,{check(){}});
   await readers.path.check();
   activation=selectActivation(host,offer);
   publication=handoverPublicationRequester(host,offer,()=>{});
   const receipt=await activation.commit();
   assert.deepEqual(receipt.selection,offer.selection);
   const association=retainHandoverPublicationAssociation(host,offer,offer.case.handoverSelection);
   const published=await publishHandoverService(host,offer,publication,association,()=>{});
   assertHandoverPathContinuation(originalCut.handoverSelection,published.served.handoverSelection);
   assert.deepEqual(await activation.commit(),receipt);
   console.log('SEALED_PROCESS_RECOVERY '+JSON.stringify({
    checkpointWasCommitted:committed,protectedStreams:14,pid:host.processId,processIds:[...processIds],
    publication:published.nativeObservation,wholeRoomActivated:false,
   }));
  }finally{
   readers?.close();
   activation?.close();
   publication?.close();
   globalThis.fetch=request;
   if(!exited)await host?.stop();
  }
 });
}
