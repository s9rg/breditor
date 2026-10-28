/** Genuine owner exclusion before reflection and finite DATA cancellation.
 * Only explicit read factories are paused; native/source grants are not faked. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {setImmediate as turn} from 'node:timers/promises';
import {generationCompleteControlFixtures} from './fixtures/generation-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/selected-generation-reconciliation/accepted-transport.mjs';
import {generationSelectedSession,selectStart} from './fixtures/selected-generation-reconciliation/session.mjs';
import {pauseNativeRead,within} from './fixtures/native-reconstruction/initial-capture.mjs';
import {withSelectedNativeReconstruction as held} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {withHeldReconstructionInputs} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/held_inputs.js';
let fixtures,transport;before(async()=>{fixtures=await generationCompleteControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});after(async()=>{transport?.restore();await fixtures?.close();});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
test('bounded reconstruction reserves real native aliases before input reflection; copied owners do not inspect input',async()=>{
 const s=await generationSelectedSession(fixtures,'gen-reconstruct-reflection',{subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false}),clients=s.owner.clients,nested=[];let reflected=0;
 try{const incoming=new Proxy(s.input(),{ownKeys(target){reflected++;for(const client of clients)assert.throws(()=>client.core.dispatch({commands:[]}),error=>error.code==='native_recovery_busy');nested.push(assert.rejects(held(s.owner,s.input(),async()=>{}),error=>error.code==='asset_adoption_busy'));return Reflect.ownKeys(target);}});await held(s.owner,incoming,async scope=>{assert.ok(Object.isFrozen(scope.reads));for(const row of scope.reads)assert.ok(Object.isFrozen(row));scope.check();});await Promise.all(nested);assert.ok(reflected>0);
  reflected=0;const bad=new Proxy({},{ownKeys(){reflected++;throw Error('Do not reflect copied owner input');}});await assert.rejects(held({},bad,async()=>{}),error=>error.code==='asset_adoption_policy');assert.equal(reflected,0);for(const client of clients)assert.equal(typeof client.core.select(null),'boolean');
 }finally{await Promise.all(nested);await s.close();}
});
test('all seven initial native readers cancel before late host results and free each unclaimed owner once',async()=>{
 const s=await generationSelectedSession(fixtures,'gen-reconstruct-all-reader-abort',{documentSegmented:true,reviewSegmented:true});try{
  for(const id of ['original','generation','independent-local','independent-delivery','restored-graph','local-operation-snapshot','local-operation-flat']){const controller=new AbortController(),gate=pauseNativeRead(s.input().reads,id);let running;
   try{running=held(s.owner,{...s.input(),reads:gate.reads,signal:controller.signal},scope=>scope.retainCurrent());const observed=running.then(()=>({ready:true}),error=>({ready:false,error}));await within(gate.started,id+' genuine first capture',60000);controller.abort();const result=await within(observed,id+' finite cancellation');assert.equal(result.ready,false);const core=s.owner.clients[0].core;selectStart(core);core.type('Still editable ');assert.equal(core.undo(),true);}
   finally{controller.abort();await gate.releaseLate();await running?.catch(()=>{});gate.assertFreed();}
  }
 }finally{await s.close();}
});
test('additional asset cancellation reaches the actual first capture without waiting for a segmented factory',async()=>{
 const s=await generationSelectedSession(fixtures,'gen-reconstruct-asset-reader-abort',{subset:['original','local-operation-flat'],documentSegmented:true,reviewSegmented:true}),controller=new AbortController(),gate=pauseNativeRead(s.input().reads,'original');let running;
 try{running=held(s.owner,{...s.input(),reads:gate.reads},async scope=>{scope.observeReadSignal(controller.signal);return scope.retainCurrent();});const observed=running.then(()=>({ready:true}),error=>({ready:false,error}));await within(gate.started,'first asset-linked capture',60000);controller.abort();assert.equal((await within(observed,'asset-linked capture abort')).ready,false);for(const client of s.owner.clients)assert.equal(typeof client.core.select(null),'boolean');}
 finally{controller.abort();await gate.releaseLate();await running?.catch(()=>{});try{await s.close();}finally{gate.assertFreed();}}
});
test('cancellation does not abandon actual visitor cleanup or release native exclusion before it settles',async()=>{
 const s=await generationSelectedSession(fixtures,'gen-reconstruct-visitor-cleanup',{subset:['original','local-operation-flat'],documentSegmented:false,reviewSegmented:false}),controller=new AbortController(),entered=deferred(),cleanup=deferred();let running,closing;
 try{const retained=await s.retain(),expected=s.owner.clients.map(row=>({id:row.id,families:[row.family]})),clients=s.owner.clients;running=held(s.owner,{...s.input(),signal:controller.signal},scope=>withHeldReconstructionInputs(scope,retained,undefined,undefined,expected,async()=>{entered.resolve();await cleanup.promise;scope.check();}));const observed=running.then(()=>({ready:true}),error=>({ready:false,error}));await within(entered.promise,'held DATA visitor',60000);controller.abort();let finished=false;void observed.then(()=>{finished=true;});await turn();assert.equal(finished,false,'Real visitor cleanup remains awaited');for(const client of clients)assert.throws(()=>client.core.select(null),error=>error.code==='native_recovery_busy');let closed=false;closing=s.owner.close().then(()=>{closed=true;});await turn();assert.equal(closed,false,'Original owner cannot free source custody during cleanup');cleanup.resolve();assert.equal((await within(observed,'actual cleanup')).ready,false);await within(closing,'real owner closure');for(const client of clients)assert.throws(()=>client.core.select(null));
 }finally{cleanup.resolve();await running?.catch(()=>{});await closing?.catch(()=>{});await s.close();}
});
