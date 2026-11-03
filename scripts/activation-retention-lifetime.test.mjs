/** Cancellable retention of inert activation DATA, actual corpus and normal Rust hashing. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {retainedActivationData} from './fixtures/activation-retention/actual-intent.mjs';
import {prepareHeldRoomActivation as prepare} from '../packages/breditor-collaboration/dist/room_native_activation_intent/prepare.js';
import {SharedDurableNativeActivationHost as Host} from '../packages/breditor-collaboration/dist/native_activation_control/host.js';
let native,capture,choice,reset;before(async()=>{({native,capture,choice}=await retainedActivationData());reset=environment();});after(()=>reset?.());
test('DATA retention callback can await owner shutdown without trapping the preparation lifetime',{timeout:30000},async()=>{
 const controller=new AbortController();let operation,closing,release,enter,timer,requests=0,tokens=0;
 const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>enter=resolve),originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{requests++;throw Error('Preparation must send no request');};
 const host=Host.configure({endpoint:'http://127.0.0.1:1/recovery/native-activation/v1/commit',expected:choice.activation,principal:'operator',getToken(){tokens++;throw Error('No token request during DATA preparation');},checkAuthority(){}});
 const check=()=>{if(controller.signal.aborted)throw Error('Actual preparation owner ended');};
 try{
  operation=prepare(capture,{database:'actual-retain-close-cycle',selectActivation(){return host;},retainChoice(selected){assert.equal(selected.objects.length,13);assert.equal(Object.isFrozen(selected),true);closing=Promise.resolve().then(async()=>{controller.abort();await operation.catch(()=>{});});enter();return Promise.race([closing,gate]);}},{wasm:native,checkAuthority:check,signal:controller.signal},check);
  const observed=operation.then(()=>({ok:true}),error=>({ok:false,error}));await Promise.race([entered,observed.then(result=>{throw result.error??Error('Preparation completed before DATA callback');})]);
  const finished=await Promise.race([closing.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),250);})]);clearTimeout(timer);assert.equal(finished,true,'DATA-only retention must not keep the actual preparation waiting on its own Close');
  assert.equal((await observed).ok,false);assert.equal(requests,0);assert.equal(tokens,0);assert.deepEqual(await indexedDB.databases(),[]);
 }finally{clearTimeout(timer);release();await operation?.catch(()=>{});await closing;host.close();globalThis.fetch=originalFetch;}
});

const hostFor=()=>Host.configure({endpoint:'http://127.0.0.1:1/recovery/native-activation/v1/commit',expected:choice.activation,principal:'operator',getToken(){throw Error('No token request during DATA retention');},checkAuthority(){}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('cancelled DATA retention observes a later rejection without creating an intent',{timeout:30000},async()=>{
 const controller=new AbortController(),host=hostFor();let rejectLate,enter,operation,timer;const gate=new Promise((_,reject)=>rejectLate=reject),entered=new Promise(resolve=>enter=resolve),check=()=>{if(controller.signal.aborted)throw Error('Preparation cancelled');};
 try{
  operation=prepare(capture,{database:'late-data-retainer-no-intent',selectActivation:()=>host,retainChoice(){enter();return gate;}},{wasm:native,checkAuthority:check,signal:controller.signal},check);const observed=operation.then(()=>({ok:true}),error=>({ok:false,error}));
  await Promise.race([entered,observed.then(result=>{throw result.error??Error('Retainer not called');})]);controller.abort();
  const result=await Promise.race([observed,new Promise(resolve=>timer=setTimeout(()=>resolve({timedOut:true}),250))]);clearTimeout(timer);assert.equal(result.timedOut,undefined);assert.equal(result.ok,false);assert.deepEqual(await indexedDB.databases(),[]);
  rejectLate(Error('Test-owned late DATA write rejection'));await tick();await tick();assert.deepEqual(await indexedDB.databases(),[]);
 }finally{clearTimeout(timer);rejectLate?.(Error('Cleanup late DATA result'));await operation?.catch(()=>{});host.close();}
});
test('successful DATA retention completes before the absent-only intent and retains every actual object',{timeout:30000},async()=>{
 const host=hostFor();let release,enter,operation,seen;const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>enter=resolve),check=()=>{};
 try{
  operation=prepare(capture,{database:'successful-data-retainer-intent',selectActivation:()=>host,retainChoice(selected){seen=selected;enter();return gate;}},{wasm:native,checkAuthority:check},check);const observed=operation.then(value=>({ok:true,value}),error=>({ok:false,error}));await Promise.race([entered,observed.then(result=>{throw result.error??Error('Retainer not called');})]);
  assert.equal(seen.objects.length,13);assert.deepEqual(seen.objects,choice.objects);assert.deepEqual(await indexedDB.databases(),[]);release();const result=await observed;if(!result.ok)throw result.error;assert.deepEqual(result.value,seen);
  const {RoomActivationIntentStore:Store}=await import('../packages/breditor-collaboration/dist/room_native_activation_intent/store.js'),store=new Store(result.value,{wasm:native,checkAuthority:check});
  try{const saved=await store.open();assert.equal(saved.state.phase,'prepared');assert.deepEqual(saved.choice,seen);assert.equal(saved.capture.recovery.kind,'retained');assert.equal(saved.capture.recovery.bundle.assets.kind,'retained');}finally{await store.close();}
  assert.deepEqual((await indexedDB.databases()).map(row=>row.name),['successful-data-retainer-intent']);
 }finally{release();await operation?.catch(()=>{});host.close();}
});
