/** Genuine complete durable recipes plus actual retained author custody. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRetirement,databaseNames} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {retirePreparedRoomKeepingActors} from '../packages/breditor-collaboration/dist/native_room_retirement/coordinator.js';
import {takeSelectedRetiredActors} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {readPreparedRoom} from '../packages/breditor-collaboration/dist/native_room_preparation/coordinator.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const row of fixtures.manifest.cases){let code;try{await fetch(row.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:row.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/prepared-retained-actor-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
test('complete saved room recipes and fresh approval retire all seven writers while retaining actual author locks',async()=>{
 const f=await preparedRetirement(fixtures,'prepared-actual-actor-retirement',{documentSegmented:false,reviewSegmented:true});let custody,calls=0;
 try{const names=await databaseNames(),before=await sourceByteSnapshots(),actors=f.s.f.f.rows.map(row=>({room:row.owner.options.room,writer:row.client.writer,actor:row.client.actor}));
  const result=await retirePreparedRoomKeepingActors(f.s.owner,f.s.input(),{expected:f.data.choice,retained:f.retained,approve(choice){calls++;assert.deepEqual(choice,f.data.choice);return true;}});
  assert.equal(calls,1);assert.equal(result.state,'old-writers-closed');assert.equal('activate' in result,false);assert.equal('core' in result,false);assert.throws(()=>f.s.owner.clients);custody=takeSelectedRetiredActors(f.s.owner);assert.throws(()=>takeSelectedRetiredActors(f.s.owner));
  for(const row of actors){await assert.rejects(SharedWriterLease.acquire(row.room,row.writer));await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor));}
  assert.deepEqual(await databaseNames(),names);await assertSourceBytesUnchanged(before);assert.deepEqual((await readPreparedRoom(f.data.choice,f.integrity)).choice,f.data.choice);
  await custody.close();for(const row of actors){const document=await SharedWriterLease.acquire(row.room,row.writer),review=await ReviewWriterLease.acquire(row.room,row.actor);await review.close();await document.close();}
 }finally{try{await f.s.owner.discardAndClose();if(!custody)try{custody=takeSelectedRetiredActors(f.s.owner);}catch{}}finally{try{await custody?.close();}finally{await f.close();}}}
});
