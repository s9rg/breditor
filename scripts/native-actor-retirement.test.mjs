/** Genuine seven-family native operational root. Explicit test-owned retirement,
 * not new durable whole-room execution or authenticated serving activation. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {selectedProviderSession} from './fixtures/selected-room-provider/session.mjs';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots as sourceRows,assertSourceBytesUnchanged as assertRowsUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {withSelectedNativeActorRetirement,takeSelectedRetiredActors} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {transferPhysicalOperationV3RetainedRoot} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {closeRetainedPhysicalKeepingActors,takeRetainedPhysicalActors} from '../packages/breditor-collaboration/dist/physical_room_operation_v3/retained_root.js';
import {reserveNativeRecovery} from '../packages/breditor-collaboration/dist/core.js';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {checkManagedCore} from '../packages/breditor-collaboration/dist/managed_custody.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;const root=new URL('../',import.meta.url).pathname;
before(async()=>{fixtures=await completeControlFixtures(root);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/actual-retained-actor-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test('actual SDK retirement keeps seven-family actors '+documentSegmented+'/'+reviewSegmented,async()=>{
 const s=await selectedProviderSession(fixtures,'actual-retained-actor-root-'+documentSegmented+'-'+reviewSegmented,{documentSegmented,reviewSegmented});let custody;
 try{const clients=s.owner.clients.map(({id,core})=>({id,core})),original=await sourceRows(),pairs=clients.map(({core})=>nativePair(core)),actors=s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));assert.equal(clients.length,7);assert.equal(actors.length,7);for(const row of actors){assert.equal(typeof row.room,'string');assert.equal(typeof row.writer,'string');assert.equal(typeof row.actor,'string');}
  const result=await withSelectedNativeActorRetirement(s.owner,s.input(),async scope=>{
   assert.equal(scope.clients.length,7);assert.throws(()=>takeSelectedRetiredActors(s.owner));
   for(const [index,{core}]of clients.entries()){assert.deepEqual(nativePair(core),pairs[index]);assert.throws(()=>core.type('No edit during complete reservation'));}
   await scope.retainRetirementCurrent();scope.check();return 'complete final source witness';
  });assert.equal(result,'complete final source witness');custody=takeSelectedRetiredActors(s.owner);
  assert.throws(()=>takeSelectedRetiredActors(s.owner));assert.throws(()=>s.owner.clients);for(const {core}of clients)assert.throws(()=>core.undo());
  await assertRowsUnchanged(original);
  for(const row of actors){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),error=>error?.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),error=>error?.code==='review_writer_in_use');}
  await custody.close();for(const row of actors){const document=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await document.close();}
  await assertRowsUnchanged(original);saveEvidence(fixtures.directory+'/actual-retained-actor-'+documentSegmented+'-'+reviewSegmented+'.json',{passed:true,documentSegmented,reviewSegmented,actualOperationalFamilies:7,actualActorLocks:14,sourceRowsUnchanged:true,actorsStayedExclusiveThroughOldParentCleanup:true,actorReacquisitionAfterExplicitEscrowClose:true,durableWholeRoomExecutor:false,servingActivated:false});
 }finally{try{await s.owner.discardAndClose();}finally{try{await custody?.close();}finally{await s.close();}}}
});

test('actual failed old cleanup retains donated authors until the same canonical owner finishes cleanup',async()=>{
 const s=await selectedProviderSession(fixtures,'retained-actor-failed-cleanup',{documentSegmented:false,reviewSegmented:false}),oldClose=RecoveryLease.prototype.close;
 let custody,hit=false,armed=false;const clients=s.owner.clients.map(({core})=>core),actors=s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor})),original=await sourceRows();
 try{
  RecoveryLease.prototype.close=async function(){let terminal=false;try{checkManagedCore(clients[0]);}catch(error){terminal=error?.code==='retired'||error?.code==='disposed';}if(armed&&!hit&&terminal){hit=true;throw Error('Test-owned actual old namespace release failure');}return oldClose.call(this);};
  await assert.rejects(withSelectedNativeActorRetirement(s.owner,s.input(),async scope=>{await scope.retainRetirementCurrent();armed=true;}));
  RecoveryLease.prototype.close=oldClose;assert.equal(hit,true);assert.throws(()=>takeSelectedRetiredActors(s.owner));
  for(const row of actors){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer));await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor));}
  await s.owner.discardAndClose();custody=takeSelectedRetiredActors(s.owner);
  for(const row of actors){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer));await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor));}
  await assertRowsUnchanged(original);await custody.close();
  for(const row of actors){const document=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await document.close();}
 }finally{RecoveryLease.prototype.close=oldClose;try{await s.owner.discardAndClose();if(!custody)try{custody=takeSelectedRetiredActors(s.owner);}catch{}}finally{try{await custody?.close();}finally{await s.close();}}}
});
test('missing final native witness and copied owner refuse without actor donation or retirement',async()=>{
 const s=await selectedProviderSession(fixtures,'retained-actor-no-final',{documentSegmented:false,reviewSegmented:false});
 try{await assert.rejects(withSelectedNativeActorRetirement({},s.input(),async()=>{}));await assert.rejects(withSelectedNativeActorRetirement(s.owner,s.input(),async()=>{}));assert.throws(()=>takeSelectedRetiredActors(s.owner));assert.equal(s.owner.clients.length,7);for(const {core}of s.owner.clients)core.select(null);}
 finally{await s.close();}
});
test('a genuine retained root rejects missing, fake and partial native reservations before any retirement',async()=>{
 const f=await completeHistoryFixture({fixtures,tag:'retained-root-exact-reservation',documentSegmented:false,reviewSegmented:false,participantAuthority(){}});let root,reservation,custody,calls=0;
 try{
  root=await transferPhysicalOperationV3RetainedRoot(f.owner,{reads:f.reads,checkAuthority(){}},async(_scope,actual)=>({value:actual,checkCurrent(){},consume(){},async abandon(){}}));
  const clients=root.clients.map(({core})=>core),before=await sourceRows(),actors=f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));assert.equal(clients.length,7);
  for(const supplied of [undefined,null,{check(){calls++;}}]){await assert.rejects(Promise.resolve().then(()=>closeRetainedPhysicalKeepingActors(root,supplied)));for(const core of clients)assert.doesNotThrow(()=>checkManagedCore(core));}
  assert.equal(calls,0);reservation=reserveNativeRecovery([clients[0]]);await assert.rejects(Promise.resolve().then(()=>closeRetainedPhysicalKeepingActors(root,reservation)),error=>error?.code==='native_recovery_member');for(const core of clients)assert.doesNotThrow(()=>checkManagedCore(core));reservation.close();
  reservation=reserveNativeRecovery(clients);await closeRetainedPhysicalKeepingActors(root,reservation);reservation.close();custody=takeRetainedPhysicalActors(root);assert.throws(()=>takeRetainedPhysicalActors(root));await assertRowsUnchanged(before);
  for(const row of actors){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer));await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor));}
  await custody.close();for(const row of actors){const document=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await document.close();}
 }finally{reservation?.close();try{await root?.discardAndClose();if(root&&!custody)try{custody=takeRetainedPhysicalActors(root);}catch{}}finally{try{await custody?.close();}finally{await f.close();}}}
});
