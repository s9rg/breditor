/** Native host boundary only: real seal, inactive target and authenticated HTTP
 * activation. Whole SDK orchestration and publication have separate tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativeHandoverActivationRoot} from './fixtures/native-activation/handover-root.mjs';
import {handoverControls} from './fixtures/selected-delivery/cold-continuation.mjs';
import {SharedDurableNativeActivationHost as Activation} from '../packages/breditor-collaboration/dist/index.js';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';

test('sealed successor stays inactive until authenticated HTTP and preserves its path after one actual epoch',{timeout:180000},async()=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 const root=nativeHandoverActivationRoot(new URL('../',import.meta.url).pathname);
 const host=await selectedDeliveryNativeHost(root,{nativeActivation:true,nativeHandoverActivation:true,suggestionGrants:true});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(url,{...options,headers});};
 let readers,activation,denied;
 try{
  const first=host.initial,sealed=await host.handover(),offer=host.handoverActivationOffer();
  assert.notDeepEqual(sealed.selection.source.origin,first.selection.source.origin);assert.equal(sealed.clientEndpoint,first.clientEndpoint);assert.deepEqual(offer.selection.current,sealed.selection.source);
  await assert.rejects(host.finishActivation(offer),/actual-native-service-not-committed/);
  const actual=await host.refresh();readers=await handoverControls(host,actual,{check(){}});
  denied=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=> '0'.repeat(64),checkAuthority(){}});
  await assert.rejects(denied.commit(),error=>error.code==='activation_outcome_unknown');
  await assert.rejects(host.finishActivation(offer),/actual-native-service-not-committed/);
  activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>host.activationToken(offer),checkAuthority(){}});
  const receipt=await activation.commit();assert.deepEqual(receipt.selection,offer.selection);
  await readers.path.check();assert.deepEqual(await activation.commit(),receipt);
  const served=await host.finishActivation(offer);assert.deepEqual(served.selection.source,offer.selection.current);assert.equal(served.clientEndpoint,first.clientEndpoint);
  const file=join(host.directory,'language-3-standard-true-atomic-true','sdk-native-activation-'+served.previousSequence+'-committed.json'),actualNative=JSON.parse(readFileSync(file));
  assert.deepEqual(actualNative.actualDeployment,offer.selection.planned);assert.equal(actualNative.actualNativeServiceRouterReturned,true);assert.equal(actualNative.wholeRoomActivated,false);
  console.log('INACTIVE_HANDOVER_HOST_NATIVE '+JSON.stringify({directory:host.directory,sourceChanged:true,uncommittedServiceRefused:true,wrongAuthenticationRefused:true,actualReceipt:true,repeatReceiptUnchanged:true,pathStillAuthenticated:true,actualDeployment:actualNative.actualDeployment,actualServiceRouterReturned:true,wholeRoomActivated:false}));
 }finally{globalThis.fetch=originalFetch;activation?.close();denied?.close();readers?.close();await host.stop();}
});
