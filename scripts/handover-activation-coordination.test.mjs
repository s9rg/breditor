/** Controlled transport and storage laws. Actual sealed Native activation and
 * complete client/metadata inspection require the separate real workflow. */
import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {retainedActivationData} from './fixtures/activation-retention/actual-intent.mjs';
import {handoverCaptureData} from './fixtures/native-activation/handover-data.mjs';
import {withHandoverActivationControls as using} from './fixtures/native-activation/handover-controls.mjs';
import {prepareHeldHandoverRoomActivation as prepare} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/prepare.js';
import {commitHeldHandoverRoomActivation as commit,readHeldHandoverRoomActivation as read} from '../packages/breditor-collaboration/dist/room_native_handover_activation_intent/commit.js';
import {SelectedLocalMetadataDelivery as Metadata} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
let native,capture,activation,reset;
before(async()=>{const data=await retainedActivationData();native=data.native;activation=data.choice.activation;capture=handoverCaptureData(data.capture,activation);});
beforeEach(()=>{reset=environment();});afterEach(()=>reset?.());
const options=()=>({wasm:native,checkAuthority(){}}),tick=()=>new Promise(resolve=>setImmediate(resolve));
async function quick(promise){let timer;try{const value=await Promise.race([promise.then(value=>({value}),error=>({error})),new Promise(resolve=>timer=setTimeout(()=>resolve({timedOut:true}),1000))]);assert.equal(value.timedOut,undefined,'Actual controller close must end the inert callback wait');return value;}finally{clearTimeout(timer);}}
const save=(database,controllers,retainChoice=()=>{})=>prepare(capture,{database,activation:controllers.activation,path:controllers.path,retainChoice},options(),()=>{});

test('preparation retains an independent choice before storage and sends no activation request',()=>using(capture,activation,async controls=>{
 let selected;const expected=await save('handover-prepare-order',controls,async value=>{selected=value;assert.deepEqual(await indexedDB.databases(),[]);assert.equal(controls.requests.length,0);});
 assert.deepEqual(expected,selected);const stored=await read(expected,options());assert.equal(stored.state.phase,'prepared');assert.deepEqual(stored.capture.handover,capture.handover);assert.equal(controls.requests.length,0);
}));
for(const layer of ['native','delivery','path','activation'])test('closing '+layer+' during DATA retention releases preparation without creating an intent',()=>using(capture,activation,async controls=>{
 let enter,release;const entered=new Promise(resolve=>enter=resolve),pending=new Promise(resolve=>release=resolve);
 const job=save('handover-data-close-'+layer,controls,()=>{enter();return pending;});
 try{await entered;controls.close(layer);const result=await quick(job);assert.ok(result.error);assert.deepEqual(await indexedDB.databases(),[]);release();await tick();assert.equal(controls.requests.length,0);}finally{release();await job.catch(()=>{});}
}));
for(const layer of ['native','delivery','path','activation'])test('closing '+layer+' during approval preserves the exact prepared intent and stops late approval',()=>using(capture,activation,async controls=>{
 const expected=await save('handover-approval-close-'+layer,controls);let enter,release,inspections=0;
 const entered=new Promise(resolve=>enter=resolve),approval=new Promise(resolve=>release=resolve);
 const job=commit({expected,activation:controls.activation,path:controls.path,approve(){enter();return approval;}},options(),()=>{},async()=>{inspections++;});
 try{await entered;controls.close(layer);const result=await quick(job);assert.ok(result.error);assert.equal(inspections,1);assert.equal(controls.requests.length,0);const fresh=await read(expected,options());assert.deepEqual(fresh.choice,expected);assert.equal(fresh.state.phase,'prepared');release(true);await tick();assert.equal(controls.requests.length,0);}finally{release(false);await job.catch(()=>{});}
}));
test('an explicit refusal retains prepared data and performs only the pre-approval inspection',()=>using(capture,activation,async controls=>{
 const expected=await save('handover-refusal',controls);let inspections=0;
 await assert.rejects(commit({expected,activation:controls.activation,path:controls.path,approve:()=>false},options(),()=>{},async()=>{inspections++;}),{code:'activation_intent_policy'});
 assert.equal(inspections,1);assert.equal(controls.requests.length,0);assert.equal((await read(expected,options())).state.phase,'prepared');
}));
test('an unknown request remains recorded and explicit retry requires fresh inspection and approval',()=>using(capture,activation,async controls=>{
 const expected=await save('handover-unknown-retry',controls);let inspections=0,approvals=0;
 controls.respond(()=>{throw Error('Controlled lost activation response');});
 const policy={expected,activation:controls.activation,path:controls.path,approve(){approvals++;return true;}},inspect=async()=>{inspections++;};
 await assert.rejects(commit(policy,options(),()=>{},inspect),{code:'activation_outcome_unknown'});assert.equal(controls.requests.length,1);
 const unknown=await read(expected,options());assert.equal(unknown.state.phase,'request-started');assert.equal(unknown.state.receipt,null);assert.deepEqual(unknown.capture.handover,capture.handover);
 controls.respond(()=>new Response(JSON.stringify({format:'breditor/durable-native-activation-control-receipt',formatVersion:1,selection:activation,scope:'actual-held-native-service-only'}),{headers:{'content-type':'application/json'}}));
 const result=await commit(policy,options(),()=>{},inspect);assert.deepEqual(result.intent,expected);assert.equal(approvals,2);assert.equal(inspections,4);assert.equal(controls.requests.length,2);
 const observed=await read(expected,options());assert.equal(observed.state.phase,'receipt-observed');assert.deepEqual(observed.state.receipt,result.receipt);
}));
test('copied metadata receivers refuse new activation inputs before application reflection',()=>{
 let calls=0;const input=new Proxy({},{ownKeys(){calls++;throw Error('No copied metadata input');},get(){calls++;throw Error('No copied metadata input');}});
 for(const name of ['prepareNativeActivationAcrossHandover','readNativeHandoverActivationIntent','commitNativeActivationAcrossHandover'])assert.throws(()=>Metadata.prototype[name].call({},input));
 assert.equal(calls,0);
});
