/** A pending Native restart may precede the first local execution event. A
 * fresh prepared start must be explicit; existing-only resume keeps refusing
 * missing journals. Actual seven-family Native state, controlled IDB/locks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {databaseNames,nativePair} from './fixtures/native-room-retirement/session.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged,databaseByteSnapshot} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {checkFutureNativeHistories} from './fixtures/local-metadata/future-native-histories.mjs';
import {ColdRoomExecutionAttempt as Cold} from '../packages/breditor-collaboration/dist/cold_room_execution/attempt.js';
import {internalFailureChain} from '../packages/breditor-collaboration/dist/internal_failure_cause.js';

test('explicit prepared cold start creates only a fresh run and preserves seven Native histories',{timeout:600000},async()=>{
 const fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname),transport=acceptedControlTransport(fixtures.manifest),tag='prepared-cold-start';
 let fixture,legacy,cold,collision,owner;
 try{
  fixture=await preparedRoomRun(fixtures,tag);
  const{signal,checkAuthority,...chosen}=fixture.f.s.f.options;
  const options={original:{...chosen,catalogDatabase:tag+'-catalog',checkAuthority(){}},run:fixture.options,reads:fixture.reads,sourceIntentDatabase:tag+'-cold-source-custody'};
  const before=await sourceByteSnapshots(),names=await databaseNames();
  assert.equal(names.includes(fixture.options.expected.database),false);
  legacy=Cold.resume(options);
  await assert.rejects(legacy.preview(),error=>internalFailureChain(error).some(cause=>cause.code==='room_execution_missing'));
  await legacy.close();legacy=undefined;
  await assertSourceBytesUnchanged(before);assert.deepEqual(await databaseNames(),names);
  console.log('PREPARED_COLD_BASELINE_MISSING_RUN '+JSON.stringify({actualMissingJournal:true,existingResumeCreatedNothing:true,originalSourcesUnchanged:true}));
  assert.equal(typeof Cold.beginPrepared,'function','A fresh cold start must be a separate explicit action');
  const expected=new Map(fixture.f.s.owner.clients.map(row=>[row.id,{pair:nativePair(row.core),document:row.core.documentJson(),review:row.core.reviewSnapshot().view}]));
  await fixture.f.s.owner.close();
  const old=await sourceByteSnapshots();
  cold=Cold.beginPrepared(options);assert.deepEqual(await databaseNames(),names,'Construction remains storage-free');assert.throws(()=>cold.takeOwner());
  const preview=await cold.preview();assert.equal(preview.choice.head.sequence,0);
  await assertSourceBytesUnchanged(old);
  const journal=await databaseByteSnapshot(fixture.options.expected.database);
  collision=Cold.beginPrepared(options);
  await assert.rejects(collision.preview(),error=>internalFailureChain(error).some(cause=>['room_execution_busy','recovery_in_use'].includes(cause.code)));
  await collision.close();collision=undefined;assert.deepEqual(await databaseByteSnapshot(fixture.options.expected.database),journal);
  await assert.rejects(cold.run({expected:preview.choice,approve:()=>false}));await assertSourceBytesUnchanged(old);
  const ready=await cold.run({expected:preview.choice,approve:()=>true});assert.equal(ready.state,'targets-and-assets-ready');
  const promotion=await cold.previewPromotion();await cold.promote({expected:promotion,approve:()=>true,checkAssetAuthority(){}});
  owner=cold.takeOwner();assert.equal(owner.clients.length,7);
  for(const row of owner.clients){const original=expected.get(row.id);assert.ok(original);assert.deepEqual(nativePair(row.core),original.pair);assert.equal(row.core.documentJson(),original.document);assert.deepEqual(row.core.reviewSnapshot().view,original.review);}
  await assertSourceBytesUnchanged(old);checkFutureNativeHistories(owner.clients);await assertSourceBytesUnchanged(old);
  await owner.discardAndClose();owner=undefined;
  // An existing namespace is refused even after the first owner releases it.
  const finalJournal=await databaseByteSnapshot(fixture.options.expected.database);
  collision=Cold.beginPrepared(options);await assert.rejects(collision.preview(),error=>internalFailureChain(error).some(cause=>cause.code==='room_execution_exists'));await collision.close();collision=undefined;
  assert.deepEqual(await databaseByteSnapshot(fixture.options.expected.database),finalJournal);
  console.log('PREPARED_COLD_START_COMPLETE '+JSON.stringify({families:7,existingResumeMeaningPreserved:true,absentOnly:true,actualFreshActors:true,exactFutureDocumentAndCommentHistories:true}));
 }finally{await owner?.discardAndClose();await collision?.close();await cold?.close();await legacy?.close();await fixture?.close();transport.restore();await fixtures.close();}
});
