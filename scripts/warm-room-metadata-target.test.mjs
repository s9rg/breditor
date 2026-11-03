/** Real promoted warm recipients remain private through fresh inspection and
 * terminal cleanup. Controlled browser storage/locks, unchanged Native data. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {selectedNativeDeliverySources} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {RoomExecutionAttempt as Warm,withRoomExecutionMetadataTarget as visit,roomMetadataTargetIdentity as identity,roomMetadataTargetApprovedCut as approved} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
let fixtures,transport;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});after(async()=>{transport?.restore();await fixtures?.close();});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function held(rows){for(const row of rows){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),e=>e.code==='review_writer_in_use');}}
async function released(rows){for(const row of rows){const doc=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await doc.close();}}
async function promoted(tag){const f=await preparedRoomRun(fixtures,tag,{documentSegmented:true,reviewSegmented:false}),controller=new AbortController();let attempt;try{const before=await sourceByteSnapshots(),rows=f.f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));attempt=Warm.begin(f.f.s.owner,{...f.reads,signal:controller.signal},f.options);let reflected=0;await assert.rejects(visit(attempt,new Proxy({},{ownKeys(){reflected++;throw Error('No read before actual promotion');}}),async()=>{}));assert.equal(reflected,0);await attempt.run(()=>true);const expected=await attempt.previewPromotion(),result=await attempt.promote({expected,approve:()=>true,checkAssetAuthority(){}});controller.abort();return{f,attempt,before,rows,result};}catch(error){await attempt?.close();await f.close();throw error;}}
test('fresh warm target authority is enforced and command cancellation revokes only its own witness',{timeout:600000},async()=>{
 const s=await promoted('warm-target-scope-authority');let scope,witness,release,enter,pending;
 const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>enter=resolve);
 try{
  let authority=0,visits=0;await assert.rejects(visit(s.attempt,{...s.f.f.s.input(),checkAuthority(){authority++;throw Error('Fresh authority denied');}},async()=>{visits++;}));assert.ok(authority>0);assert.equal(visits,0);await held(s.rows);
  const controller=new AbortController();let nested;
  const reads=new Proxy({...s.f.f.s.input(),signal:controller.signal},{ownKeys(target){try{s.attempt.takeOwner();}catch(error){nested=error.code;}return Reflect.ownKeys(target);}});
  pending=visit(s.attempt,reads,async(actual,proof)=>{scope=actual;witness=proof;assert.equal(nested,'room_execution_busy');assert.deepEqual(identity(proof,actual),s.f.options.expected);assert.deepEqual(approved(proof,actual),s.result.choice.approval.cut);enter();await gate;actual.check();});const refused=assert.rejects(pending);
  await entered;assert.throws(()=>s.attempt.takeOwner(),e=>e.code==='room_execution_busy');await held(s.rows);controller.abort();release();await refused;pending=undefined;assert.throws(()=>identity(witness,scope),e=>e.code==='room_execution_policy');
  await visit(s.attempt,s.f.f.s.input(),async(actual,proof)=>{assert.deepEqual(identity(proof,actual),s.f.options.expected);});await held(s.rows);await assertSourceBytesUnchanged(s.before);
 }finally{release();await pending?.catch(()=>{});await s.attempt.close();await s.f.close();}
});
test('warm terminal Close aborts and drains a fresh target visit after construction reader ended',{timeout:600000},async()=>{
 const s=await promoted('warm-target-scope-close');let scope,release,enter,pending,closing,nested,finished=false;
 const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>enter=resolve);
 try{pending=visit(s.attempt,s.f.f.s.input(),async actual=>{scope=actual;enter();await gate;actual.check();});const refused=assert.rejects(pending);await entered;scope.signal.addEventListener('abort',()=>{nested=s.attempt.close();},{once:true});const actualClose=s.attempt.close();assert.equal(nested,actualClose,'Synchronous target abort reentry joins the same cleanup');closing=actualClose.then(()=>{finished=true;});await tick();assert.equal(scope.signal.aborted,true);assert.equal(finished,false);await held(s.rows);assert.throws(()=>s.attempt.takeOwner());release();await refused;pending=undefined;await closing;await released(s.rows);await assertSourceBytesUnchanged(s.before);}
 finally{release();await pending?.catch(()=>{});await closing;await s.attempt.close();await s.f.close();}
});

test('fresh warm target inspection survives cancellation of completed execution reader',{timeout:600000},async()=>{
 const f=await preparedRoomRun(fixtures,'warm-target-old-reader',{documentSegmented:false,reviewSegmented:true}),controller=new AbortController();let attempt,owner,error,visits=0;
 try{
  const before=await sourceByteSnapshots(),rows=f.f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));
  attempt=Warm.begin(f.f.s.owner,{...f.reads,signal:controller.signal},f.options);await attempt.run(()=>true);const expected=await attempt.previewPromotion();await attempt.promote({expected,approve:()=>true,checkAssetAuthority(){}});controller.abort();
  try{await visit(attempt,f.f.s.input(),async(scope,witness)=>{visits++;scope.check();assert.deepEqual(identity(witness,scope),f.options.expected);assert.equal(selectedNativeDeliverySources(scope).length,7);});}catch(actual){error=actual;}
  for(const row of rows){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),e=>e.code==='review_writer_in_use');}
  owner=attempt.takeOwner();assert.equal(owner.clients.length,7);
  for(const row of owner.clients){const prior=f.f.clients.find(value=>value.id===row.id),review=row.core.reviewSnapshot().view;assert.deepEqual(nativePair(row.core),prior.pair);assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),prior.document);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');assert.deepEqual(row.core.reviewSnapshot().view,review);}
  await assertSourceBytesUnchanged(before);console.log('WARM_TARGET_OLD_READER_CANCEL '+JSON.stringify({oldExecutionAborted:controller.signal.aborted,freshVisits:visits,metadataError:error?.code??null,actualUsableTarget:owner.clients.length,actorCustodyRetained:true,exactFutureDocumentAndCommentHistories:true,wholeRoomActivated:false}));assert.equal(error,undefined,'Fresh target authority must not depend on completed construction reader');assert.equal(visits,1);
 }finally{await owner?.discardAndClose();await attempt?.close();await f.close();}
});
