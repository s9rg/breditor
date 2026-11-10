/** Cancellable activation callbacks with actual retained DATA and normal Rust hashing. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {retainedActivationData} from './fixtures/activation-retention/actual-intent.mjs';
import {prepareHeldRoomActivation as prepare} from '../packages/breditor-collaboration/dist/room_native_activation_intent/prepare.js';
import {commitHeldRoomActivation as commit} from '../packages/breditor-collaboration/dist/room_native_activation_intent/commit.js';
import {RoomActivationIntentStore as Store} from '../packages/breditor-collaboration/dist/room_native_activation_intent/store.js';
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
  const store=new Store(result.value,{wasm:native,checkAuthority:check});
  try{const saved=await store.open();assert.equal(saved.state.phase,'prepared');assert.deepEqual(saved.choice,seen);assert.equal(saved.capture.recovery.kind,'retained');assert.equal(saved.capture.recovery.bundle.assets.kind,'retained');}finally{await store.close();}
  assert.deepEqual((await indexedDB.databases()).map(row=>row.name),['successful-data-retainer-intent']);
 }finally{release();await operation?.catch(()=>{});host.close();}
});

test('cancelled activation approval leaves the prepared intent retryable even if approval arrives late',{timeout:30000},async()=>{
 const controller=new AbortController(),check=()=>controller.signal.throwIfAborted();
 const durableOptions={wasm:native,checkAuthority(){}};
 let releaseApproval,enteredApproval,timer,operation,inspections=0,tokens=0;
 const approval=new Promise(resolve=>{releaseApproval=resolve;});
 const entered=new Promise(resolve=>{enteredApproval=resolve;});
 const host=Host.configure({
  endpoint:'http://127.0.0.1:1/recovery/native-activation/v1/commit',
  expected:choice.activation,
  principal:'operator',
  getToken(){tokens++;throw Error('Cancelled approval must not authorize a Native request');},
  checkAuthority(){}
 });
 try{
  const expected=await prepare(capture,{
   database:'cancelled-approval-keeps-prepared',
   selectActivation:()=>host,
   retainChoice(){}
  },durableOptions,durableOptions.checkAuthority);
  operation=commit({
   expected,activation:host,
   approve(selected){assert.deepEqual(selected,expected);enteredApproval();return approval;}
  },{...durableOptions,signal:controller.signal},check,async()=>{inspections++;});
  const stopped=operation.then(()=>({ok:true}),error=>({ok:false,error}));
  await Promise.race([entered,stopped.then(result=>{throw result.error??Error('Approval was bypassed');})]);
  controller.abort();
  const result=await Promise.race([
   stopped,
   new Promise(resolve=>{timer=setTimeout(()=>resolve('still waiting for approval'),500);})
  ]);
  assert.notEqual(result,'still waiting for approval');
  assert.equal(result.ok,false);
  assert.equal(result.error.code,'native_reconstruction_aborted');
  assert.equal(inspections,1);
  const reopened=new Store(expected,durableOptions);
  try{assert.equal((await reopened.open()).state.phase,'prepared');}finally{await reopened.close();}
  releaseApproval(true);
  await tick();
  assert.equal(inspections,1);
  assert.equal(tokens,0);
 }finally{
  clearTimeout(timer);
  controller.abort();
  releaseApproval(false);
  await operation?.catch(()=>{});
  host.close();
 }
});

test('activation refuses a revoked intent before a second recovery inspection or request',{timeout:30000},async()=>{
 const options={wasm:native,checkAuthority(){}};
 const host=hostFor();
 let upgraded,inspections=0;
 try{
  const expected=await prepare(capture,{
   database:'approval-versionchange-keeps-prepared',
   selectActivation:()=>host,
   retainChoice(){}
  },options,options.checkAuthority);
  await assert.rejects(commit({
   expected,activation:host,
   async approve(){
    upgraded=await new Promise((resolve,reject)=>{
     const request=indexedDB.open(expected.database,2);
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error);
    });
    return true;
   }
  },options,options.checkAuthority,async()=>{inspections++;}),{code:'activation_intent_closed'});
  assert.equal(inspections,1);
  const retainedState=await new Promise((resolve,reject)=>{
   const request=upgraded.transaction('activation').objectStore('activation').get('state');
   request.onsuccess=()=>resolve(JSON.parse(request.result));
   request.onerror=()=>reject(request.error);
  });
  assert.equal(retainedState.phase,'prepared');
  assert.equal(retainedState.revision,0);
 }finally{
  upgraded?.close();
  host.close();
 }
});
