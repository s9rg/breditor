import {ReviewWriterLease} from '../packages/breditor-collaboration/dist/persistence/review_writer_lease.js';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {saveEvidence} from './candidate-release/evidence.mjs';
import {SharedWriterLease} from '../packages/breditor-collaboration/dist/persistence/writer_lease.js';
/** Actual seven-family target recovery retaining every old writer lock. This is
 * controlled storage/locks, not physical browser crash or serving activation. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRetirement,restorePreparedRoot,nativePair} from './fixtures/native-room-retirement/session.mjs';
import {retirePreparedRoomKeepingActors} from '../packages/breditor-collaboration/dist/native_room_retirement/coordinator.js';
import {takeSelectedRetiredActors} from '../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {within} from './fixtures/native-reconstruction/initial-capture.mjs';
let fixtures,transport;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});
after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/actor-routes-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])test('actual seven-family target retains actors and future Undo '+documentSegmented+'/'+reviewSegmented,async()=>{
 const tag='room-actor-route-'+documentSegmented+'-'+reviewSegmented,f=await preparedRetirement(fixtures,tag,{documentSegmented,reviewSegmented});
 let actors,target,parts,reacquisitions=0;const acquire=SharedWriterLease.acquire,old=await sourceByteSnapshots();
 try{
  await within(retirePreparedRoomKeepingActors(f.s.owner,f.s.input(),{retained:f.retained,expected:f.data.choice,approve:()=>true}),'retire keeping all actual actors',300000);
  actors=takeSelectedRetiredActors(f.s.owner);SharedWriterLease.acquire=function(...args){reacquisitions++;const stack=new Error('Actual writer reacquisition').stack;return acquire.apply(this,args).catch(error=>{console.log('ACTUAL_REACQUIRE',args,stack);throw error;});};
  target=await within(restorePreparedRoot(f,tag+'-target',actors),'actual target keeping all actors',300000);
  const identities=actors.bindings();assert.equal(identities.length,7);assert.equal(reacquisitions,0);
  await target.close();target=undefined;
  for(const row of identities){await assert.rejects(acquire.call(SharedWriterLease,row.room,row.writer),error=>error.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),error=>error.code==='review_writer_in_use');}
  target=await within(restorePreparedRoot(f,tag+'-target',actors,{resume:true}),'actual existing-target replay keeping all actors',300000);
  assert.equal(reacquisitions,0);await assertSourceBytesUnchanged(old);
  parts=await target.root.intoParts();actors.commit();
  for(const row of identities){await assert.rejects(acquire.call(SharedWriterLease,row.room,row.writer),error=>error.code==='writer_in_use');await assert.rejects(ReviewWriterLease.acquire(row.room,row.actor),error=>error.code==='review_writer_in_use');}
  for(const member of parts.participants){const source=member.family==='original'?member.parts.session:member.parts.source.session,core=source.core,expected=f.clients.find(row=>row.id===member.id);assert.deepEqual(nativePair(core),expected.pair,member.id);assert.equal(core.documentJson(),expected.document,member.id);assert.equal(core.undo(),true,member.id);assert.equal(core.redo(),true,member.id);assert.equal(core.documentJson(),expected.document,member.id);assert.equal(core.undoReview().kind,'committed',member.id);assert.equal(core.redoReview().kind,'committed',member.id);await source.flush();}
  await assertSourceBytesUnchanged(old);saveEvidence(fixtures.directory+'/'+tag+'.json',{passed:true,documentSegmented,reviewSegmented,actualFamilies:7,actualActorLocks:14,ordinaryReacquisitions:reacquisitions,existingTargetsReopened:true,sourceSchemaAndActualBytesPreserved:true,futureBothLaneUndoRedo:true,coldProcessActorAcquisition:false,servingActivated:false});
 }catch(error){console.log('ACTOR_ROUTE_FAILURE',tag,error?.code,error?.message,error?.stack);throw error;}
 finally{
  SharedWriterLease.acquire=acquire;
  if(parts)for(const member of parts.participants){if(member.family==='original'){await member.parts.sources.revisions?.discardAndClose();await member.parts.sources.suggestions?.discardAndClose();await member.parts.sources.versions?.discardAndClose();await member.parts.session.discardAndClose();}else await member.parts.source.session.discardAndClose();member.parts.uploads.close();}
  await target?.close();await actors?.close();await f.close();
 }
});
