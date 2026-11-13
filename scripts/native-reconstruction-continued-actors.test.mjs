/** Exercise actual native actor custody through replacement staging and cold reopen. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRetirement,restorePreparedRoot,nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {retirePreparedRoomKeepingActors} from '../packages/breditor-collaboration/dist/native_room_retirement/coordinator.js';
import {takeSelectedRetiredActors} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';

test('continued generation keeps both actor leases through seven-participant replacement and cold reopen',async()=>{
 const fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);
 const transport=acceptedControlTransport(fixtures.manifest);
 const acquireDocument=SharedWriterLease.acquire,acquireReview=ReviewWriterLease.acquire;
 let prepared,actors,target,parts;
 try{
  const tag='continued-room-actor-transfer';
  prepared=await preparedRetirement(fixtures,tag,{
   documentSegmented:false,reviewSegmented:false,generationKind:'continued-local',generationExtraVersion:true,
  });
  const originals=await sourceByteSnapshots();
  await retirePreparedRoomKeepingActors(prepared.s.owner,prepared.s.input(),{
   retained:prepared.retained,expected:prepared.data.choice,approve:()=>true,
  });
  actors=takeSelectedRetiredActors(prepared.s.owner);
  const identities=actors.bindings();
  assert.equal(identities.length,7);
  const checkLocks=async()=>{
   for(const row of identities){
    await assert.rejects(acquireDocument.call(SharedWriterLease,row.room,row.writer),error=>error.code==='writer_in_use');
    await assert.rejects(acquireReview.call(ReviewWriterLease,row.room,row.actor),error=>error.code==='review_writer_in_use');
   }
  };
  SharedWriterLease.acquire=()=>{throw Error('Unexpected document writer reacquisition');};
  ReviewWriterLease.acquire=()=>{throw Error('Unexpected review writer reacquisition');};
  target=await restorePreparedRoot(prepared,tag+'-target',actors);
  await target.close();
  target=undefined;
  await checkLocks();
  target=await restorePreparedRoot(prepared,tag+'-target',actors,{resume:true});
  parts=await target.root.intoParts();
  actors.commit();
  await checkLocks();
  assert.equal(parts.participants.length,7);
  for(const member of parts.participants){
   const session=member.family==='original'?member.parts.session:member.parts.source.session;
   const expected=prepared.clients.find(row=>row.id===member.id);
   assert.ok(expected);
   assert.deepEqual(nativePair(session.core),expected.pair,member.id);
   if(member.id==='generation'){
    assert.equal(member.parts.source.kind,'continued-local');
    const backup=await session.exportContinuedBackup();
    assert.equal(backup.current.checkpoint,expected.pair[0]);
    assert.equal(backup.predecessor.formatVersion,1);
    assert.ok(backup.predecessor.versions.length>0);
   }
  }
  await assertSourceBytesUnchanged(originals);
 }finally{
  SharedWriterLease.acquire=acquireDocument;
  ReviewWriterLease.acquire=acquireReview;
  try{
   for(const member of parts?.participants??[]){
    try{
     if(member.family==='original'){
      for(const name of ['revisions','suggestions','versions'])await member.parts.sources[name]?.discardAndClose();
      await member.parts.session.discardAndClose();
     }else await member.parts.source.session.discardAndClose();
    }finally{member.parts.uploads.close();}
   }
   await target?.close();
   await actors?.close();
   await prepared?.close();
  }finally{
   transport.restore();
   await fixtures.close();
  }
 }
});
