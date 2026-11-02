/** Real seven-family source ownership and actor locks. Command failure and
 * caller cancellation must not reopen old writers. No server commit is faked. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {NativeActivationSourceSession as Session,withNativeActivationSources as work} from '../packages/breditor-collaboration/dist/native_room_joint_activation/source_session.js';
import {registerSelectedNativeCheckpoint} from '../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();});
const next=()=>new Promise(resolve=>setImmediate(resolve));
const edit=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
function actors(f){return f.f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));}
async function held(rows){for(const row of rows){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),e=>e.code==='review_writer_in_use');}}
async function released(rows){for(const row of rows){const doc=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await doc.close();}}
test('failed command and caller abort retain actual Native exclusion; checkpoint failure retains all fourteen locks for close retry',async()=>{
 const f=await preparedRoomRun(fixtures,'joint-source-contained',{documentSegmented:true,reviewSegmented:false}),controller=new AbortController();let session,checkpoints=0;
 try{const before=await sourceByteSnapshots(),rows=actors(f);session=Session.begin(f.f.s.owner,{...f.f.s.input(),signal:controller.signal});await session.ready();
  await assert.rejects(work(session,async({scope,sources})=>{assert.equal(sources.length,7);scope.check();throw Error('Test-owned failed command');}),/Test-owned failed command/);
  await next();for(const row of f.f.clients)assert.throws(()=>edit(row.core,'must stay held'),e=>e.code==='native_recovery_busy');await assert.rejects(f.f.s.owner.close(),e=>e.code==='asset_adoption_busy');await held(rows);
  const current=await session.capture();assert.deepEqual(current.current.selection,f.data.choice.plan.preparation.plan.before);
  await work(session,async({scope})=>{registerSelectedNativeCheckpoint(scope,async()=>{checkpoints++;if(checkpoints===1)throw Error('Test-owned checkpoint refusal');});});
  controller.abort();await assert.rejects(session.capture(),e=>e.code==='joint_source_aborted');for(const row of f.f.clients)assert.throws(()=>edit(row.core,'cancellation cannot reopen'),e=>e.code==='native_recovery_busy');
  const closing=session.close(),joined=session.close();assert.equal(closing,joined);await assert.rejects(closing,/Test-owned checkpoint refusal/);assert.equal(checkpoints,1);for(const row of f.f.clients)assert.throws(()=>edit(row.core,'failed close cannot reopen'),e=>e.code==='native_recovery_busy');await held(rows);
  await session.close();assert.equal(checkpoints,2);await session.close();for(const row of f.f.clients)assert.throws(()=>edit(row.core,'retired'),e=>e.code==='retired'||e.code==='disposed');await released(rows);await assertSourceBytesUnchanged(before);
  saveEvidence(fixtures.directory+'/joint-source-contained.json',{passed:true,actualSources:7,actualActorLocks:14,commandFailureContained:true,callerAbortDidNotReleaseNative:true,checkpointFailureRetainedCustody:true,repeatedCloseJoined:true,durableStopCompleted:true,sourceBytesUnchanged:true,nativeActivationQualified:false,wholeRoomActivated:false});
 }finally{await session?.close();await f.close();}
});
test('persistent source retirement continues through genuine custody into all seven usable replacements without writer reacquisition',async()=>{
 const f=await preparedRoomRun(fixtures,'joint-source-execution',{documentSegmented:false,reviewSegmented:true});let session,attempt,owner;
 try{const before=await sourceByteSnapshots(),rows=actors(f);session=Session.begin(f.f.s.owner,f.f.s.input());await session.ready();await assert.rejects(work(session,async()=>{throw Error('A failed command is not the visitor lifetime');}));
  await session.retirePrepared({retained:f.f.retained,expected:f.f.data.choice,approve:()=>true});await held(rows);assert.throws(()=>f.f.s.owner.clients);
  attempt=session.intoExecution(f.reads,f.options);await session.close();await held(rows);const acquireDocument=SharedWriterLease.acquire,acquireReview=ReviewWriterLease.acquire;let normalAcquisitions=0;
  try{SharedWriterLease.acquire=async()=>{normalAcquisitions++;throw Error('Replacement must retain actual document custody');};ReviewWriterLease.acquire=async()=>{normalAcquisitions++;throw Error('Replacement must retain actual comment custody');};await attempt.run(()=>true);const expected=await attempt.previewPromotion();await attempt.promote({expected,approve:()=>true,checkAssetAuthority(){}});owner=attempt.takeOwner();}finally{SharedWriterLease.acquire=acquireDocument;ReviewWriterLease.acquire=acquireReview;}assert.equal(normalAcquisitions,0);assert.equal(owner.clients.length,7);
  for(const row of owner.clients){const prior=f.f.clients.find(client=>client.id===row.id);assert.deepEqual(nativePair(row.core),prior.pair);const review=row.core.reviewSnapshot().view;assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),prior.document);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');assert.deepEqual(row.core.reviewSnapshot().view,review);}
  await held(rows);await assertSourceBytesUnchanged(before);saveEvidence(fixtures.directory+'/joint-source-execution.json',{passed:true,actualSources:7,actualActorLocks:14,genuinePreparedRetirement:true,genuineActorTransfer:true,normalWriterAcquisitions:normalAcquisitions,exactFutureDocumentAndCommentHistories:true,sourceBytesUnchanged:true,normalServingPublished:false,wholeRoomActivated:false});
 }finally{await owner?.discardAndClose();await attempt?.close();await session?.close();await f.close();}
});
test('copied session-shaped data cannot execute a source callback',async()=>{let calls=0;for(const session of[{},Object.create(Session.prototype)])await assert.rejects(work(session,async()=>{calls++;}));assert.equal(calls,0);});
