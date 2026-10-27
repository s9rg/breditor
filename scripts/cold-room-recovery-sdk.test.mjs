/** Actual fresh-actor existing-parent recovery, preserving the latest native
 * and upload state. Synthetic storage is not physical crash/platform evidence. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {selectedProviderSession} from './fixtures/selected-room-provider/session.mjs';
import {secondAsset} from './fixtures/review-assets/pixels.mjs';
import {preparedRoomRun} from './fixtures/native-room-run/session.mjs';
import {coldRootInputs} from './fixtures/native-room-run/cold-inputs.mjs';
import {takeWithAbortReentry} from './fixtures/native-room-run/take-reentry.mjs';
import {nativePair,databaseNames} from './fixtures/native-room-retirement/session.mjs';
import {RoomExecutionAttempt as Warm} from '../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import {ColdRoomRecoveryAttempt as Cold} from '../packages/breditor-collaboration/dist/cold_room_recovery/attempt.js';
import {encodeSelectedRoomCurrent} from '../packages/breditor-collaboration/dist/selected_room_current/archive.js';
import {thirdPixel,thirdAsset,ParticipantFixtureImage} from './fixtures/review-assets/participant-pixels.mjs';
import {sourceByteSnapshots,assertSourceBytesUnchanged} from './fixtures/native-actor-custody/storage_bytes.mjs';
import {saveEvidence} from './candidate-release/evidence.mjs';
let fixtures,transport;before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);});after(async()=>{transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const row of fixtures.manifest.cases){let code;try{await fetch(row.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:row.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(fixtures.directory+'/cold-room-endpoints-closed.json',{rows});assert.ok(rows.every(row=>row.closed));}});
test('fresh cold ownership preserves later native work and uploads beyond the independently retained baseline',async()=>{const f=await preparedRoomRun(fixtures,'cold-room-latest',{documentSegmented:true,reviewSegmented:true}),controller=new AbortController();let warm,owner,cold;
 try{warm=Warm.begin(f.f.s.owner,f.reads,f.options);await warm.run(()=>true);const expected=await warm.previewPromotion();await warm.promote({expected,approve:()=>true,checkAssetAuthority(){}});owner=warm.takeOwner();await warm.close();
  const integrity={wasm:fixtures.native,checkAuthority(){}},basis=await encodeSelectedRoomCurrent(await owner.capture(f.f.s.input()),integrity);
  const first=owner.clients[0];first.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Persisted after baseline '}}]});
  Object.defineProperty(globalThis,'Image',{value:ParticipantFixtureImage,configurable:true});await owner.assets(first.id).ingest(new Blob([thirdPixel],{type:'image/png'}));
  // Normal close persists current work. No old native object/cohort is an input
  // to the following process-independent entry point.
  const latest=owner.clients.map(row=>({id:row.id,pair:nativePair(row.core),document:row.core.documentJson()}));await owner.close();owner=undefined;const names=await databaseNames(),bytes=await sourceByteSnapshots();
  cold=Cold.begin({root:coldRootInputs(f,fixtures.native),basis,reads:{...f.f.s.input(),signal:controller.signal},intentDatabase:'cold-room-latest-current-intent'});assert.throws(()=>cold.takeOwner());await cold.open();const preview=await cold.preview();assert.notDeepEqual(preview.choice.current,basis.selection);assert.deepEqual(await databaseNames(),names);await assertSourceBytesUnchanged(bytes);
  await cold.promote({expected:preview.choice,async approve(choice){assert.deepEqual(choice,preview.choice);await assert.rejects(cold.open(),e=>e.code==='room_execution_busy');return true;},checkAssetAuthority(){}});controller.abort();owner=cold.takeOwner();await cold.close();
  for(const client of owner.clients){const before=latest.find(row=>row.id===client.id);assert.deepEqual(nativePair(client.core),before.pair,client.id);assert.equal(client.core.documentJson(),before.document,client.id);assert.equal(client.core.undo(),true);assert.equal(client.core.redo(),true);assert.equal(client.core.documentJson(),before.document);assert.equal(client.core.undoReview().kind,'committed');assert.equal(client.core.redoReview().kind,'committed');}
  assert.ok((await owner.assets(first.id).list()).some(row=>row.asset===thirdAsset&&row.status==='pending'));const current=await owner.capture(f.f.s.input());assert.equal(current.uploads.length,7);await owner.close();owner=undefined;
  saveEvidence(fixtures.directory+'/cold-room-latest.json',{passed:true,sourcePaths:7,freshActors:14,oldObjectsNotInput:true,baselineWasOlderThanNativeAndUploads:true,laterWorkAndQueuesPreserved:true,nativeUndoRedoPreserved:true,finiteJobEndedBeforeTake:true,serverActivated:false});
 }finally{try{await owner?.discardAndClose();}finally{try{await cold?.close();}finally{try{await warm?.close();}finally{await f.close();}}}}
});

for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test('fresh existing-source recovery '+documentSegmented+'/'+reviewSegmented+' retains all seven original source kinds and later receipts',async()=>{
 const tag='cold-original-'+documentSegmented+'-'+reviewSegmented,s=await selectedProviderSession(fixtures,tag,{documentSegmented,reviewSegmented}),controller=new AbortController();let owner=s.owner,cold;
 try{const basis=await s.retain(),latest=[];for(const client of owner.clients){client.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'After retained basis '}}]});assert.equal(client.core.redoReview().kind,'committed');latest.push({id:client.id,pair:nativePair(client.core),document:client.core.documentJson(),review:client.core.reviewSnapshot().view});}
  const first=owner.clients[0];await owner.assets(first.id).retry(secondAsset);await owner.assets(first.id).flush(async()=> 'later-receipt/'+tag);assert.equal((await owner.assets(first.id).get(secondAsset)).storageRef,'later-receipt/'+tag);await owner.close();owner=undefined;
  const {signal,checkAuthority,...chosen}=s.f.options,root={...chosen,catalogDatabase:tag+'-catalog',checkAuthority(){}},bytes=await sourceByteSnapshots(),names=await databaseNames();
  cold=Cold.begin({root,basis,reads:{...s.input(),signal:controller.signal},intentDatabase:tag+'-cold-current'});await cold.open();const preview=await cold.preview();assert.notDeepEqual(preview.choice.current,basis.selection);await assertSourceBytesUnchanged(bytes);assert.deepEqual(await databaseNames(),names);
  await cold.promote({expected:preview.choice,approve:()=>true,checkAssetAuthority(){}});const taken=takeWithAbortReentry(cold);owner=taken.owner;assert.equal(taken.fired,true,'A real abort observer ran during finite-job cleanup');assert.equal(taken.nestedCode,'room_execution_busy');assert.equal(taken.outerFailed,false);controller.abort();await cold.close();
  for(const client of owner.clients){const before=latest.find(row=>row.id===client.id);assert.deepEqual(nativePair(client.core),before.pair);assert.deepEqual(client.core.reviewSnapshot().view,before.review);assert.equal(client.core.undo(),true);assert.equal(client.core.redo(),true);assert.equal(client.core.documentJson(),before.document);assert.equal(client.core.undoReview().kind,'committed');assert.equal(client.core.redoReview().kind,'committed');}
  assert.equal((await owner.assets(first.id).get(secondAsset)).storageRef,'later-receipt/'+tag);const current=await owner.capture(s.input());assert.equal(current.uploads.length,7);await owner.close();owner=undefined;saveEvidence(fixtures.directory+'/'+tag+'.json',{passed:true,documentSegmented,reviewSegmented,sourcePaths:7,freshActors:14,laterNativeAndReceiptPreserved:true,bothLaneUndoRedo:true,serverActivated:false});
 }finally{try{await owner?.discardAndClose();}finally{try{await cold?.close();}finally{await s.close();}}}
});
