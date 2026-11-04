/** The original publication fixture keeps its existing authenticated workflow. */
import test from 'node:test';import assert from 'node:assert/strict';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {nativePublicationRoot} from './fixtures/native-publication/native-root.mjs';
import {SharedDurableNativeActivationHost as Activation} from '../packages/breditor-collaboration/dist/index.js';
import {SharedNativeRoomPublicationHost as Publication} from '../packages/breditor-collaboration/dist/native_publication_control/host.js';

test('legacy publication fixture still requires authenticated commit then authenticated publication',{timeout:180000},async()=>{
 const root=nativePublicationRoot(resolve(new URL('../',import.meta.url).pathname)),fetch=globalThis.fetch;let host,activation,publication;
 globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return fetch(url,{...options,headers});};
 try{
  host=await selectedDeliveryNativeHost(root,{nativeActivation:true,nativePublication:true});const offer=await host.prepareJointActivation(host.initial.selection.source);
  activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>host.activationToken(offer),checkAuthority(){}});
  publication=Publication.configure({endpoint:offer.publication.endpoint,expected:offer.publication.selection,principal:'operator',getToken:()=>host.publicationToken(offer.publication),checkAuthority(){}});
  const bytes=Buffer.from(JSON.stringify({activation:offer.selection,publication:offer.publication.selection})),binding={bytes:bytes.length,sha256:[...createHash('sha256').update(bytes).digest()]};
  await assert.rejects(host.finishActivation(offer),/no finish IPC/);await assert.rejects(host.observePublication(offer),/actual-native-publication-not-observed/);await assert.rejects(publication.publish(binding),e=>e.code==='publication_outcome_unknown');
  const native=await activation.commit();assert.deepEqual(native.selection,offer.selection);await assert.rejects(host.observePublication(offer),/actual-native-publication-not-observed/);
  const published=await publication.publish(binding);assert.deepEqual(published.selection,offer.publication.selection);assert.deepEqual(await publication.publish(binding),published);
  const actual=await host.observePublication(offer);assert.deepEqual(actual.selection.source,offer.selection.current);
 }finally{activation?.close();publication?.close();if(host)await host.stop();globalThis.fetch=fetch;}
});
