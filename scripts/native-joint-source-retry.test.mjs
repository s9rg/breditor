/** Actual seven-family durable parent cleanup can fail after earlier sources
 * captured their actor escrows. Retry must retain that mixed actual custody. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {selectedProviderSession} from './fixtures/selected-room-provider/session.mjs';
import {NativeActivationSourceSession as Session} from '../packages/breditor-collaboration/dist/native_room_joint_activation/source_session.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();});
const edit=core=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'must stay stopped'}}]});
async function held(rows){for(const row of rows){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer),e=>e.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),e=>e.code==='review_writer_in_use');}}
test('actual durable shutdown retries after two source actor transfers without releasing any of fourteen locks',async()=>{
 const f=await selectedProviderSession(fixtures,'joint-source-partial-parent-close',{documentSegmented:true,reviewSegmented:true}),close=ReviewWriterLease.prototype.close,assertLive=ReviewWriterLease.prototype.assertLive;
 let session,completed=0,hit=false;const rows=f.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor})),cores=f.owner.clients.map(row=>row.core);
 try{const before=await sourceByteSnapshots();session=Session.begin(f.owner,f.input());await session.ready();
  ReviewWriterLease.prototype.close=async function(){let live=false;try{assertLive.call(this);live=true;}catch{}
   if(live&&completed===2&&!hit){hit=true;throw Error('Test-owned third actual comment close refusal');}
   await close.call(this);if(live)completed++;
  };
  await assert.rejects(session.close(),/Test-owned third actual comment close refusal/);assert.equal(hit,true);assert.equal(completed,2);await held(rows);
  for(const core of cores)assert.throws(()=>edit(core),e=>e.code==='retired'||e.code==='disposed');await assert.rejects(f.owner.close(),e=>e.code==='asset_adoption_busy');await assertSourceBytesUnchanged(before);
  ReviewWriterLease.prototype.close=close;await session.close();await session.close();
  for(const row of rows){const document=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await document.close();}
  await assertSourceBytesUnchanged(before);saveEvidence(fixtures.directory+'/joint-source-partial-close.json',{passed:true,actualSources:7,actualLocks:14,earlierCapturedActors:2,mixedCapturedAndOriginalCustodyRetained:true,canonicalDurableRetryCompleted:true,sourceBytesUnchanged:true,physicalStorageQualified:false,wholeRoomActivated:false});
 }finally{ReviewWriterLease.prototype.close=close;await session?.close();await f.close();}
});
