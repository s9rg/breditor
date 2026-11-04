/** Actual intent/store/hash refusal under controlled Node storage. The short
 * result is injected; this is not a reproduction of the physical read fault. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBObjectStore} from 'fake-indexeddb';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {encodeRoomActivationIntent} from '../packages/breditor-collaboration/dist/room_native_activation_intent/encode.js';
import {RoomActivationIntentStore} from '../packages/breditor-collaboration/dist/room_native_activation_intent/store.js';
import {commitHeldRoomActivation} from '../packages/breditor-collaboration/dist/room_native_activation_intent/commit.js';
import {SharedDurableNativeActivationHost} from '../packages/breditor-collaboration/dist/native_activation_control/host.js';
import {captureFixture} from './fixtures/native-activation/capture.mjs';
import {options as activationOptions} from './fixtures/native-activation/transport.mjs';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';

test('a measured intent read refusal after approval retains its numbers, sends no HTTP and preserves prepared data',async()=>{
 await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
 const reset=environment(),arrayBuffer=Blob.prototype.arrayBuffer,fetch=globalThis.fetch;
 const options={wasm:native,checkAuthority(){}};let store,host,armed=false,injections=0,readBytes=0,requests=0,writes=0;
 const methods=new Map(['add','put','delete','clear'].map(name=>[name,IDBObjectStore.prototype[name]]));
 try{
  const fixture=captureFixture(),encoded=await encodeRoomActivationIntent('measured-activation-read-refusal',fixture.activation,fixture.capture,options);
  store=new RoomActivationIntentStore(encoded.choice,options);const before=await store.open(encoded);await store.close();store=undefined;
  assert.equal(before.state.phase,'prepared');assert.equal(before.state.receipt,null);
  for(const[name,original]of methods)IDBObjectStore.prototype[name]=function(...args){if(this.transaction.db.name===encoded.choice.database)writes++;return original.apply(this,args);};
  host=SharedDurableNativeActivationHost.configure(activationOptions({expected:encoded.choice.activation}));
  globalThis.fetch=async()=>{requests++;throw Error('No HTTP may begin after the injected refusal');};
  Blob.prototype.arrayBuffer=function(){
   if(armed&&this.size>0){armed=false;injections++;readBytes=this.size;return Promise.resolve(new ArrayBuffer(0));}
   return arrayBuffer.call(this);
  };
  let refused;
  try{await commitHeldRoomActivation({expected:encoded.choice,activation:host,approve(){armed=true;return true;}},options,()=>{},async()=>{});}
  catch(error){refused=error;}
  finally{Blob.prototype.arrayBuffer=arrayBuffer;}
  assert.equal(injections,1);assert.ok(readBytes>0);assert.equal(requests,0);assert.equal(writes,0);
  assert.equal(refused?.code,'activation_outcome_unknown');
  assert.deepEqual(refused.readFailure,{kind:'read-length',offset:0,expectedBytes:readBytes,observedBeforeAuthorityBytes:0,actualBytes:0});
  assert.ok(Object.isFrozen(refused.readFailure));assert.equal(Object.hasOwn(refused,'cause'),false);
  // A separate, explicit read with the original host method verifies that no
  // state write, receipt or capture repair was hidden inside the failed action.
  store=new RoomActivationIntentStore(encoded.choice,options);const after=await store.open();
  assert.deepEqual(after.choice,before.choice);assert.deepEqual(after.state,before.state);
  assert.deepEqual(after.capture,before.capture);
 }finally{Blob.prototype.arrayBuffer=arrayBuffer;globalThis.fetch=fetch;for(const[name,original]of methods)IDBObjectStore.prototype[name]=original;host?.close();await store?.close();reset();}
});
