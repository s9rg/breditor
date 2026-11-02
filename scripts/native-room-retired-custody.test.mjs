/** Actual reservation transfer after same-source retirement. Original authors
 * stay in escrow through constructor reflection, rollback and target recovery.
 * Controlled IDB/locks are not production serving or process-crash evidence. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {nativePair,databaseNames} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {reserveSelectedActorExecution,releaseSelectedActorExecution,withReservedSelectedActorRetirement,takeReservedSelectedActors,retryReservedSelectedActorCleanup,selectedOwnerHasRetiredActors} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {verifyHeldPreparedRoomRetirement} from '../packages/breditor-collaboration/dist/native_room_retirement/held_scope.js';
import {RoomExecutionAttempt as Attempt} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {roomRunIdentity} from '../packages/breditor-collaboration/dist/native_room_execution_run/identity.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();});
const docAcquire=SharedWriterLease.acquire,reviewAcquire=ReviewWriterLease.acquire;
function actorRows(f){return f.f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));}
async function held(rows){for(const row of rows){await assert.rejects(docAcquire.call(SharedWriterLease,row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(reviewAcquire.call(ReviewWriterLease,row.room,row.actor),e=>e.code==='review_writer_in_use');}}
async function cleanupOriginal(owner,reservation){if(selectedOwnerHasRetiredActors(owner)){await retryReservedSelectedActorCleanup(reservation);const actors=takeReservedSelectedActors(reservation);await actors.close();}releaseSelectedActorExecution(reservation);}
test('retirement DATA and a still-live reservation cannot construct a retired executor',async()=>{
 const f=await preparedRoomRun(fixtures,'retired-custody-live'),old=f.f.s.owner,reservation=reserveSelectedActorExecution(old);
 try{const before=await sourceByteSnapshots(),names=await databaseNames();assert.throws(()=>Attempt.beginRetired(old,{},f.reads,f.options));assert.throws(()=>Attempt.beginRetired(old,reservation,f.reads,f.options),e=>e.code==='asset_adoption_policy');assert.equal(old.clients.length,7);await held(actorRows(f));await assertSourceBytesUnchanged(before);assert.deepEqual(await databaseNames(),names);}
 finally{releaseSelectedActorExecution(reservation);await f.close();}
});
test('same-source preparation binds a reversible constructor transfer, then all seven replacements retain exact future histories',async()=>{
 const f=await preparedRoomRun(fixtures,'retired-custody-handoff',{documentSegmented:true,reviewSegmented:false}),old=f.f.s.owner,reservation=reserveSelectedActorExecution(old);let attempt,owner,transferred=false,acquisitions=0;
 try{const before=await sourceByteSnapshots(),rows=actorRows(f);
  await withReservedSelectedActorRetirement(old,reservation,f.f.s.input(),scope=>verifyHeldPreparedRoomRetirement(scope,{retained:f.f.retained,expected:f.f.data.choice,approve:()=>true}));await held(rows);assert.throws(()=>old.clients);
  // A structurally admitted but different preparation must not borrow the
  // stopped writers. The binding came from actual same-scope recipe admission.
  const other=structuredClone(f.options.expected);other.execution.plan.preparation.plan.database='another-selected-preparation';const admitted=roomRunIdentity(other);assert.notDeepEqual(admitted.execution.plan.preparation,f.options.expected.execution.plan.preparation);
  assert.throws(()=>Attempt.beginRetired(old,reservation,f.reads,{...f.options,expected:admitted}),e=>e.code==='room_execution_policy');await retryReservedSelectedActorCleanup(reservation);await held(rows);
  let rollbackProbes=0;const refused=new Proxy(f.options,{ownKeys(){rollbackProbes++;assert.throws(()=>takeReservedSelectedActors(reservation),e=>e.code==='asset_adoption_policy');releaseSelectedActorExecution(reservation);throw Error('Test-owned input-reflection refusal');}});
  assert.throws(()=>Attempt.beginRetired(old,reservation,f.reads,refused));assert.equal(rollbackProbes,1);await retryReservedSelectedActorCleanup(reservation);await held(rows);
  let reflected=0;const options=new Proxy(f.options,{ownKeys(value){reflected++;assert.throws(()=>takeReservedSelectedActors(reservation),e=>e.code==='asset_adoption_policy');releaseSelectedActorExecution(reservation);return Reflect.ownKeys(value);}});
  attempt=Attempt.beginRetired(old,reservation,f.reads,options);transferred=true;assert.ok(reflected>0);assert.throws(()=>takeReservedSelectedActors(reservation),e=>e.code==='asset_adoption_policy');await assert.rejects(Promise.resolve().then(()=>retryReservedSelectedActorCleanup(reservation)),e=>e.code==='asset_adoption_policy');releaseSelectedActorExecution(reservation);await held(rows);
  SharedWriterLease.acquire=function(...args){acquisitions++;return docAcquire.apply(this,args);};
  const result=await attempt.run(()=>true);assert.equal(result.state,'targets-and-assets-ready');const expected=await attempt.previewPromotion();await attempt.promote({expected,approve:()=>true,checkAssetAuthority(){}});owner=attempt.takeOwner();assert.equal(owner.clients.length,7);assert.equal(acquisitions,0);SharedWriterLease.acquire=docAcquire;await held(rows);
  for(const client of owner.clients){const prior=f.f.clients.find(row=>row.id===client.id);assert.deepEqual(nativePair(client.core),prior.pair);assert.equal(client.core.documentJson(),prior.document);const review=client.core.reviewSnapshot().view;assert.equal(client.core.undo(),true);assert.equal(client.core.redo(),true);assert.equal(client.core.documentJson(),prior.document);assert.equal(client.core.undoReview().kind,'committed');assert.equal(client.core.redoReview().kind,'committed');assert.deepEqual(client.core.reviewSnapshot().view,review);}
  await assertSourceBytesUnchanged(before);const first=owner.clients[0].core,doc=first.documentJson(),point={block:'p',offset:'0',affinity:'after'};first.select({kind:'text',anchor:point,focus:point});first.type('after actual custody transfer ');assert.notEqual(first.documentJson(),doc);assert.equal(first.undo(),true);assert.equal(first.documentJson(),doc);await held(rows);
  saveEvidence(fixtures.directory+'/retired-custody-handoff.json',{passed:true,actualSources:7,actualActorLocks:14,ordinaryWriterReacquisitions:acquisitions,constructorRollbackPreservedOriginal:true,preparationBindingChecked:true,oldReservationRevokedBeforeReflection:true,allFutureDocumentAndCommentHistoriesExact:true,sourceBytesUnchanged:true,localSuccessorUsable:true,wholeRoomActivated:false});
 }finally{SharedWriterLease.acquire=docAcquire;try{await owner?.discardAndClose();}finally{try{await attempt?.close();if(!transferred)await cleanupOriginal(old,reservation);}finally{await f.close();}}}
});
