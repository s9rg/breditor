/** Unchanged shared read-kernel laws for source, installed and bundled runs.
 * Kernel witnesses are explicit unit doubles, not native ownership proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalReadReservation} from '../../../packages/breditor-collaboration/dist/operation_read/reservation.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../../../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {OperationalReadCancellation} from '../../../packages/breditor-collaboration/dist/operation_read/cancellation.js';
import {environment} from '../room-participant-inventory/environment.mjs';
const fail=()=>Error('Read reservation closed or busy');

test('read kernel exposes no handoff operation and checks all sources after the last callback',async()=>{
 let a=0,unlocked=0;
 const r=operationalReadReservation(2,async index=>{
  const stamp=a;
  return{value:index,check(){},async verify(){if(index===1)a++;},current(){if(index===0)assert.equal(a,stamp);},release(){}};
 },()=>unlocked++,fail);
 try{for(const method of ['consume','markReleased','releaseLeases','disposeAuxiliaries'])assert.equal(method in r,false);assert.throws(()=>r.states);await r.prepare();assert.deepEqual(r.states,[0,1]);await assert.rejects(r.verify());}
 finally{r.close();}
 assert.equal(unlocked,1);assert.throws(()=>r.states);r.close();assert.equal(unlocked,1);
});
test('partial preparation retains read borrows until explicit cleanup, never consumes a member',async()=>{
 let released=0,unlocked=0;
 const r=operationalReadReservation(2,async index=>{if(index===1)throw Error('actual admission refused');return{value:0,check(){},current(){},async verify(){},release(){released++;}};},()=>unlocked++,fail);
 await assert.rejects(r.prepare(),/actual admission refused/);assert.equal(released,0);assert.equal(unlocked,0);assert.throws(()=>r.states);r.close();assert.equal(released,1);assert.equal(unlocked,1);
});
test('failed same-handle cleanup keeps ownership until its actual remaining reader closes',async()=>{
 let attempts=0,unlocked=0;
 const r=operationalReadReservation(1,async()=>({value:0,check(){},current(){},async verify(){},release(){if(++attempts===1)throw Error('reader close refused');}}),()=>unlocked++,fail);
 await r.prepare();assert.throws(()=>r.close(),/reader close refused/);assert.equal(unlocked,0);assert.throws(()=>r.states);r.close();assert.equal(attempts,2);assert.equal(unlocked,1);
});
test('actual lease read refuses as soon as close starts and cannot be replaced by a DTO',async()=>{
 const reset=environment();let lease;
 try{lease=await RecoveryLease.acquire('read-lease-law');checkRecoveryLeasesHeld([lease]);assert.throws(()=>checkRecoveryLeasesHeld([{checkHeld(){}}]));const closing=lease.close();assert.throws(()=>checkRecoveryLeasesHeld([lease]));await closing;await lease.close();}
 finally{await lease?.close();reset();}
});
test('read cancellation ignores forged events and never calls a caller getter during its final fence',async()=>{
 const controller=new AbortController();let reads=0;Object.defineProperty(controller.signal,'aborted',{get(){reads++;throw Error('No final signal getter');}});
 const observed=new OperationalReadCancellation(controller.signal);controller.signal.dispatchEvent(new Event('abort'));observed.check(fail);assert.equal(reads,0);controller.abort();assert.throws(()=>observed.check(fail));assert.equal(reads,0);observed.close();observed.close();await Promise.resolve();assert.equal(reads,0);
});
