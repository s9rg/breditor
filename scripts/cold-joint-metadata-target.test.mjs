/** Genuine interrupted execution, fresh cold actors and a still-private
 * promoted target. Browser storage/locks are controlled; no serving is claimed. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {RoomExecutionAttempt as Warm,withColdRoomExecutionMetadataTarget as visit,roomMetadataTargetIdentity as identity,roomMetadataTargetApprovedCut as cut} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {ColdRoomExecutionAttempt as Cold} from '../packages/breditor-collaboration/dist/cold_room_execution/attempt.js';
import {selectedNativeDeliverySources} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const options=(f,tag,executionSignal)=>{const {signal,checkAuthority,...original}=f.f.s.f.options;return{original:{...original,catalogDatabase:tag+'-catalog',checkAuthority(){}},run:f.options,reads:{...f.reads,...(executionSignal?{signal:executionSignal}:{})},sourceIntentDatabase:tag+'-source-custody'};};
function actors(f){return f.f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));}
async function held(rows){for(const row of rows){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),e=>e.code==='review_writer_in_use');}}
async function released(rows){for(const row of rows){const doc=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await doc.close();}}
async function interrupted(tag,executionSignal){
 const f=await preparedRoomRun(fixtures,tag,{documentSegmented:true,reviewSegmented:false}),before=await sourceByteSnapshots(),rows=actors(f);let warm,cold;
 try{
  warm=Warm.begin(f.f.s.owner,f.reads,f.options);const add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put,names=new Set(f.options.expected.execution.plan.preparation.plan.participants.filter(row=>row.id==='original').flatMap(row=>row.namespaces.filter(ns=>ns.role==='document').map(ns=>ns.database)));let hits=0;
  const fault=function(fn,args){const q=fn.apply(this,args);if(!hits&&names.has(this.transaction.db.name)){hits++;this.transaction.abort();}return q;};
  try{IDBObjectStore.prototype.add=function(...args){return fault.call(this,add,args);};IDBObjectStore.prototype.put=function(...args){return fault.call(this,put,args);};await assert.rejects(warm.run(()=>true));assert.equal(hits,1);}finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;await warm.close();}
  await released(rows);assert.throws(()=>f.f.s.owner.clients);cold=Cold.resume(options(f,tag,executionSignal));let reflected=0;
  const untouched=new Proxy({},{ownKeys(){reflected++;throw Error('No option access before actual cold promotion');}});
  await assert.rejects(visit(cold,untouched,async()=>{}),e=>e.code==='room_execution_closed');assert.equal(reflected,0);
  const preview=await cold.preview();await cold.run({expected:preview.choice,approve:()=>true});const expected=await cold.previewPromotion();const promotion=await cold.promote({expected,approve:()=>true,checkAssetAuthority(){}});await held(rows);await assertSourceBytesUnchanged(before);
  return{f,cold,promotion,before,rows};
 }catch(error){await cold?.close();await warm?.close();await f.close();throw error;}
}
test('cold witness rejects descriptions and copied prototypes before options or callbacks',async()=>{let reflected=0,called=0;const reads=new Proxy({},{ownKeys(){reflected++;throw Error('No forged owner reflection');}});for(const owner of [{},Object.create(Cold.prototype),{state:'receipt-observed'}])await assert.rejects(visit(owner,reads,async()=>{called++;}),e=>e.code==='room_execution_policy');assert.equal(reflected,0);assert.equal(called,0);});
test('cold promoted visit retains all fourteen actors, revokes its witness and allows exact future histories',{timeout:600000},async()=>{
 const s=await interrupted('cold-joint-visit');let owner,scope,witness,release,entered,pending;
 const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 try{
  const read=s.f.f.s.input();let reentry;
  const reflected=new Proxy(read,{ownKeys(target){try{s.cold.takeOwner();}catch(error){reentry=error.code;}return Reflect.ownKeys(target);}});
  await visit(s.cold,reflected,async(actual,proof)=>{
   assert.equal(reentry,'room_execution_busy');
   scope=actual;
   witness=proof;
   const admitted=identity(proof,actual);
   assert.deepEqual(admitted,s.f.options.expected);
   assert.strictEqual(identity(proof,actual),admitted);
   assert.equal(Object.isFrozen(admitted.execution.plan.preparation.plan.participants),true);
   assert.deepEqual(cut(proof,actual),s.promotion.choice.approval.cut);
   assert.equal(selectedNativeDeliverySources(actual).length,7);
   actual.check();
  });
  assert.throws(()=>identity(witness,scope),e=>e.code==='room_execution_policy');assert.throws(()=>scope.check());
  const controller=new AbortController();pending=visit(s.cold,{...read,signal:controller.signal},async(actual,proof)=>{scope=actual;witness=proof;assert.equal(selectedNativeDeliverySources(actual).length,7);entered();await gate;actual.check();});const refused=assert.rejects(pending);
  await started;assert.throws(()=>s.cold.takeOwner(),e=>e.code==='room_execution_busy');await held(s.rows);controller.abort();await tick();assert.throws(()=>s.cold.takeOwner(),e=>e.code==='room_execution_busy');release();await refused;pending=undefined;
  assert.throws(()=>identity(witness,scope),e=>e.code==='room_execution_policy');await held(s.rows);
  await visit(s.cold,read,async(actual,proof)=>{assert.deepEqual(identity(proof,actual),s.f.options.expected);for(const row of selectedNativeDeliverySources(actual))assert.throws(()=>row.source.core.select(null),e=>e.code==='native_recovery_busy');});
  owner=s.cold.takeOwner();for(const row of owner.clients){const prior=s.f.f.clients.find(value=>value.id===row.id),review=row.core.reviewSnapshot().view;assert.deepEqual(nativePair(row.core),prior.pair);assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),prior.document);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');assert.deepEqual(row.core.reviewSnapshot().view,review);}
  await assertSourceBytesUnchanged(s.before);
 }finally{release();await pending?.catch(()=>{});await owner?.discardAndClose();await s.cold.close();await s.f.close();}
});
test('terminal cold close joins an actual outstanding target visit before releasing actors',{timeout:600000},async()=>{
 const s=await interrupted('cold-joint-visit-close');let release,enter,pending,closing,finished=false;
 const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>enter=resolve);
 try{pending=visit(s.cold,s.f.f.s.input(),async scope=>{enter();await gate;scope.check();});const refused=assert.rejects(pending);await entered;closing=s.cold.close().then(()=>{finished=true;});await tick();assert.equal(finished,false);await held(s.rows);await assert.rejects(visit(s.cold,s.f.f.s.input(),async()=>{}));assert.throws(()=>s.cold.takeOwner());release();await refused;pending=undefined;await closing;await released(s.rows);await assertSourceBytesUnchanged(s.before);}
 finally{release();await pending?.catch(()=>{});await closing;await s.cold.close();await s.f.close();}
});

test('a fresh target visit survives cancellation of the completed execution reader',{timeout:600000},async()=>{
 const executionController=new AbortController();const s=await interrupted('cold-joint-old-reader-abort',executionController.signal);let owner,error,visits=0;
 try{
  executionController.abort();let freshAuthorityCalls=0,deniedVisits=0;
  await assert.rejects(visit(s.cold,{...s.f.f.s.input(),checkAuthority(){freshAuthorityCalls++;throw Error('Fresh target authority denied');}},async()=>{deniedVisits++;}));
  assert.ok(freshAuthorityCalls>0);assert.equal(deniedVisits,0);await held(s.rows);
  try{await visit(s.cold,s.f.f.s.input(),async(scope,witness)=>{visits++;scope.check();assert.deepEqual(identity(witness,scope),s.f.options.expected);assert.equal(selectedNativeDeliverySources(scope).length,7);});}catch(actual){error=actual;}
  await held(s.rows);owner=s.cold.takeOwner();assert.equal(owner.clients.length,7);
  for(const row of owner.clients){const prior=s.f.f.clients.find(value=>value.id===row.id),review=row.core.reviewSnapshot().view;assert.deepEqual(nativePair(row.core),prior.pair);assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),prior.document);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');assert.deepEqual(row.core.reviewSnapshot().view,review);}
  await assertSourceBytesUnchanged(s.before);
  console.log('COLD_TARGET_OLD_READER_CANCEL '+JSON.stringify({oldExecutionAborted:executionController.signal.aborted,freshVisits:visits,metadataError:error?.code??null,actualUsableTarget:owner.clients.length,actorCustodyRetained:true,exactFutureDocumentAndCommentHistories:true,wholeRoomActivated:false}));
  assert.equal(error,undefined,'A fresh genuine target visit must not depend on the completed execution reader');assert.equal(visits,1);
 }finally{await owner?.discardAndClose();await s.cold.close();await s.f.close();}
});
