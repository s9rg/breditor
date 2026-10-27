/** Genuine seven-family native operational root. Explicit test-owned retirement,
 * not new durable whole-room execution or authenticated serving activation. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {selectedProviderSession} from './fixtures/selected-room-provider/session.mjs';
import {nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots as sourceRows,assertSourceBytesUnchanged as assertRowsUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {NativeActorRetirement} from '../packages/breditor-collaboration/dist/persistence/native_actor_cohort.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {retireOwnedCore} from '../packages/breditor-collaboration/dist/owned_core_lifetime.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;const root=new URL('../',import.meta.url).pathname;
before(async()=>{fixtures=await completeControlFixtures(root);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/actor-operational-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test('actual seven-family operational actor handoff '+documentSegmented+'/'+reviewSegmented,async()=>{
 const s=await selectedProviderSession(fixtures,'actor-operational-root-'+documentSegmented+'-'+reviewSegmented,{documentSegmented,reviewSegmented});let custody;
 try{const clients=s.owner.clients.map(({id,core})=>({id,core})),original=await sourceRows(),pairs=clients.map(({core})=>nativePair(core)),actors=s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));assert.equal(clients.length,7);assert.equal(actors.length,7);for(const row of actors){assert.equal(typeof row.room,'string');assert.equal(typeof row.writer,'string');assert.equal(typeof row.actor,'string');}
  const ready=NativeActorRetirement.prepare(clients);ready.checkBeforeRetirement();for(const {core} of clients)retireOwnedCore(core);custody=ready.takeAfterRetirement();for(const [index,{core}]of clients.entries()){assert.deepEqual(nativePair(core),pairs[index]);assert.throws(()=>core.undo());}
  await s.owner.discardAndClose();await assertRowsUnchanged(original);
  for(const row of actors){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),error=>error?.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),error=>error?.code==='review_writer_in_use');}
  await custody.close();for(const row of actors){const document=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await document.close();}
  await assertRowsUnchanged(original);saveEvidence(fixtures.directory+'/actor-operational-'+documentSegmented+'-'+reviewSegmented+'.json',{passed:true,documentSegmented,reviewSegmented,actualOperationalFamilies:7,actualActorLocks:14,sourceRowsUnchanged:true,actorsStayedExclusiveThroughOldParentCleanup:true,actorReacquisitionAfterExplicitEscrowClose:true,durableWholeRoomExecutor:false,servingActivated:false});
 }finally{try{await s.owner.discardAndClose();}finally{try{await custody?.close();}finally{await s.close();}}}
});
