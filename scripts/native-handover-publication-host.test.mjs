/** An actual sealed successor gets normal routes from authenticated publication. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {SharedDurableNativeActivationHost as Activation} from '../packages/breditor-collaboration/dist/index.js';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeHandoverActivationRoot} from './fixtures/native-activation/handover-root.mjs';
import {handoverControls} from './fixtures/selected-delivery/cold-continuation.mjs';
import {
 assertHandoverPublicationWaiting,
 handoverPublicationRequester,
 retainHandoverPublicationAssociation,
 publishHandoverService,
} from './fixtures/native-publication/sealed-handover.mjs';

test('sealed Native handover serves only through authenticated publication and keeps the same epoch on retry',{timeout:180000},async()=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 const host=await selectedDeliveryNativeHost(nativeHandoverActivationRoot(new URL('../',import.meta.url).pathname),{
  nativeActivation:true,nativeHandoverActivation:true,nativeHandoverPublication:true,suggestionGrants:true,
 });
 const request=globalThis.fetch;
 globalThis.fetch=(url,options={})=>{
  const headers=new Headers(options.headers);
  headers.set('Origin','http://127.0.0.1:4187');
  return request(url,{...options,headers});
 };
 let activation,publication,readers;
 try{
  const sealed=await host.handover();
  const offer=host.handoverActivationOffer();
  assert.notDeepEqual(sealed.selection.source.origin,host.initial.selection.source.origin);
  assert.equal(sealed.clientEndpoint,host.initial.clientEndpoint);
  const association=retainHandoverPublicationAssociation(host,offer,sealed.handoverSelection);
  publication=handoverPublicationRequester(host,offer,()=>{});
  await assert.rejects(publication.publish(association.pin),{code:'publication_outcome_unknown'});
  await assertHandoverPublicationWaiting(host,offer);
  readers=await handoverControls(host,await host.refresh(),{check(){}});
  activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>host.activationToken(offer),checkAuthority(){}});
  const receipt=await activation.commit();
  assert.deepEqual(receipt.selection,offer.selection);
  const published=await publishHandoverService(host,offer,publication,association,()=>{});
  assert.deepEqual(published.served.handoverSelection.path.earlier,sealed.handoverSelection.path.earlier);
  await readers.path.check();
  assert.deepEqual(await activation.commit(),receipt);
  console.log('SEALED_HANDOVER_NATIVE_PUBLICATION '+JSON.stringify({
   actualDeployment:receipt.selection.planned,
   exactAssociation:published.receipt.joint,
   nativeObservation:published.nativeObservation,
   serviceAvailableBeforeObservation:true,
   repeatReceiptUnchanged:true,
   wholeRoomActivated:false,
  }));
 }finally{
  globalThis.fetch=request;
  readers?.close();
  publication?.close();
  activation?.close();
  await host.stop();
 }
});
