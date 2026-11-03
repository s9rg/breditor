/** Real partial durable retirement must roll forward over its actual retained
 * cohort. Neither a changed recipe nor a reentrant close can supply actors. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {NativeActivationSourceSession as Session} from '../packages/breditor-collaboration/dist/native_room_joint_activation/source_session.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();});
const actorRows=f=>f.f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));
async function held(rows){for(const row of rows){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),e=>e.code==='review_writer_in_use');}}
async function released(rows){for(const row of rows){const document=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await document.close();}}
test('two actual close refusals retain all fourteen locks and only the original recipe can reach seven exact replacements',{timeout:1200000},async()=>{
 const f=await preparedRoomRun(fixtures,'joint-retirement-retry-forward',{documentSegmented:false,reviewSegmented:true}),close=ReviewWriterLease.prototype.close,assertLive=ReviewWriterLease.prototype.assertLive;
 const acquireDocument=SharedWriterLease.acquire,acquireReview=ReviewWriterLease.acquire;let session,attempt,owner,completed=0,first=false,second=false,approvals=0,normalAcquisitions=0;
 try{
  const original=await sourceByteSnapshots(),rows=actorRows(f),options={retained:f.f.retained,expected:f.f.data.choice,approve(){approvals++;return true;}};
  session=Session.begin(f.f.s.owner,f.f.s.input());await session.ready();
  ReviewWriterLease.prototype.close=async function(){let live=false;try{assertLive.call(this);live=true;}catch{}if(live&&completed===2&&!first){first=true;throw Error('Test-owned third actual retirement close refusal');}if(live&&completed===4&&!second){second=true;throw Error('Test-owned fifth actual retirement close refusal');}await close.call(this);if(live)completed++;};
  await assert.rejects(session.retirePrepared(options),/third actual retirement close refusal/);assert.equal(completed,2);assert.equal(approvals,1);await held(rows);
  const foreign=structuredClone(options.expected);foreign.selection.sha256=(foreign.selection.sha256[0]==='a'?'b':'a')+foreign.selection.sha256.slice(1);
  await assert.rejects(session.retirePrepared({...options,expected:foreign}),e=>e.code==='joint_source_state');assert.equal(completed,2);await held(rows);
  await assert.rejects(session.retirePrepared(options),/fifth actual retirement close refusal/);assert.equal(completed,4);await held(rows);
  await session.retirePrepared(options);assert.equal(completed,7);assert.equal(approvals,1,'Already approved cleanup cannot relabel or reapprove a new recipe');await held(rows);ReviewWriterLease.prototype.close=close;
  SharedWriterLease.acquire=async()=>{normalAcquisitions++;throw Error('Replacement must retain actual document custody');};ReviewWriterLease.acquire=async()=>{normalAcquisitions++;throw Error('Replacement must retain actual comment custody');};
  assert.throws(()=>session.intoExecution(f.reads,{...f.options,expected:{}}));attempt=session.intoExecution(f.reads,f.options);await attempt.run(()=>true);const expected=await attempt.previewPromotion();await attempt.promote({expected,approve:()=>true,checkAssetAuthority(){}});owner=attempt.takeOwner();assert.equal(normalAcquisitions,0);
  SharedWriterLease.acquire=acquireDocument;ReviewWriterLease.acquire=acquireReview;assert.equal(owner.clients.length,7);
  for(const row of owner.clients){const prior=f.f.clients.find(old=>old.id===row.id);assert.ok(prior);assert.deepEqual(nativePair(row.core),prior.pair);const review=row.core.reviewSnapshot().view;assert.equal(row.core.undo(),true);assert.equal(row.core.redo(),true);assert.equal(row.core.documentJson(),prior.document);assert.equal(row.core.undoReview().kind,'committed');assert.equal(row.core.redoReview().kind,'committed');assert.deepEqual(row.core.reviewSnapshot().view,review);}
  await held(rows);await assertSourceBytesUnchanged(original);saveEvidence(fixtures.directory+'/joint-retirement-retry-forward.json',{passed:true,actualSources:7,actorLocks:14,capturedBeforeFirstFailure:2,capturedBeforeSecondFailure:4,foreignRecipeRefused:true,originalApprovalCalls:approvals,normalWriterAcquisitions:normalAcquisitions,allSevenReplacementHistoriesExact:true,sourceBytesUnchanged:true,wholeRoomActivated:false});
 }finally{ReviewWriterLease.prototype.close=close;SharedWriterLease.acquire=acquireDocument;ReviewWriterLease.acquire=acquireReview;await owner?.discardAndClose();await attempt?.close();await session?.close();await f.close();}
});
test('reentrant terminal close joins the actual retirement retry before releasing any actor',{timeout:1200000},async()=>{
 const f=await preparedRoomRun(fixtures,'joint-retirement-retry-close',{documentSegmented:true,reviewSegmented:false}),close=ReviewWriterLease.prototype.close,assertLive=ReviewWriterLease.prototype.assertLive;let session,closing,completed=0,hit=false,reads=0;
 try{
  const original=await sourceByteSnapshots(),rows=actorRows(f);session=Session.begin(f.f.s.owner,f.f.s.input());await session.ready();
  ReviewWriterLease.prototype.close=async function(){let live=false;try{assertLive.call(this);live=true;}catch{}if(live&&completed===2&&!hit){hit=true;throw Error('Test-owned reentrant retirement close refusal');}await close.call(this);if(live)completed++;};
  await assert.rejects(session.retirePrepared({retained:f.f.retained,expected:f.f.data.choice,approve:()=>true}),/reentrant retirement close refusal/);await held(rows);ReviewWriterLease.prototype.close=close;
  // Accessors are deliberately refused. A Proxy reflection trap is the real
  // reentry point, before strict field detachment reads any values.
  const options=new Proxy({retained:f.f.retained,expected:f.f.data.choice,approve(){throw Error('Cleanup must use its original approved recipe');}},{ownKeys(target){reads++;closing=session.close();assert.throws(()=>session.intoExecution(f.reads,f.options),e=>e.code==='joint_source_busy');return Reflect.ownKeys(target);}});
  await session.retirePrepared(options);
  assert.equal(reads,1);assert.ok(closing);await closing;await session.close();assert.throws(()=>session.intoExecution(f.reads,f.options),e=>e.code==='joint_source_state'||e.code==='joint_source_closed');await released(rows);await assertSourceBytesUnchanged(original);
  saveEvidence(fixtures.directory+'/joint-retirement-retry-close.json',{passed:true,actualSources:7,actorLocks:14,reentrantCloseJoinedBeforeActorRelease:true,noReplacementExposed:true,allActorsReleasedOnlyAfterActualClose:true,sourceBytesUnchanged:true,wholeRoomActivated:false});
 }finally{ReviewWriterLease.prototype.close=close;await closing;await session?.close();await f.close();}
});
test('partial unprepared suspension cannot be upgraded by presenting an existing preparation',{timeout:1200000},async()=>{
 const f=await preparedRoomRun(fixtures,'joint-retirement-retry-no-grant',{documentSegmented:true,reviewSegmented:true}),close=ReviewWriterLease.prototype.close,assertLive=ReviewWriterLease.prototype.assertLive;let session,completed=0,hit=false,approvals=0;
 try{
  const original=await sourceByteSnapshots(),rows=actorRows(f);session=Session.begin(f.f.s.owner,f.f.s.input());await session.ready();
  ReviewWriterLease.prototype.close=async function(){let live=false;try{assertLive.call(this);live=true;}catch{}if(live&&completed===2&&!hit){hit=true;throw Error('Test-owned unprepared suspension close refusal');}await close.call(this);if(live)completed++;};
  await assert.rejects(session.suspend(),/unprepared suspension close refusal/);await held(rows);ReviewWriterLease.prototype.close=close;
  await assert.rejects(session.retirePrepared({retained:f.f.retained,expected:f.f.data.choice,approve(){approvals++;return true;}}),e=>e.code==='joint_source_state');assert.equal(approvals,0);await held(rows);
  await session.suspend();assert.throws(()=>session.intoExecution(f.reads,f.options),e=>e.code==='joint_source_state');await held(rows);await session.close();await released(rows);await assertSourceBytesUnchanged(original);
  saveEvidence(fixtures.directory+'/joint-retirement-retry-no-grant.json',{passed:true,actualSources:7,actorLocks:14,existingPreparationDidNotGrantRetirement:true,approvalCalls:approvals,actualSuspensionCompleted:true,noReplacementExposed:true,sourceBytesUnchanged:true,wholeRoomActivated:false});
 }finally{ReviewWriterLease.prototype.close=close;await session?.close();await f.close();}
});
