/** Real seven-writer same-room read laws. No browser or network activation
 * claim; both source bytes and every cooperative parent lease remain held. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sevenNativeFixtures} from '../physical-operation-v3/seven-native.mjs';
import {sevenFamilyRoomFixture} from '../physical-operation-v3/seven-room.mjs';
import {verifyV3RecoveredParticipant} from '../physical-operation-v3/participants.mjs';
import {snapshotReadDatabases} from './storage-snapshot.mjs';
import {PhysicalRoomCatalogV3 as Catalog} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3 as Operation} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {RecoveryLease} from '../../../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {internalFailureChain} from '../../../packages/breditor-collaboration/dist/internal_failure_cause.js';
const fixtures=await sevenNativeFixtures();
assert.deepEqual(fixtures.manifest.cases.map(item=>{const data=fixtures.fixture(item);return[data.language,data.standard,data.atomic];}),[1,2,3].flatMap(language=>(language===1?[false]:[false,true]).flatMap(standard=>[false,true].map(atomic=>[language,standard,atomic]))));
async function retire(parts){for(const row of parts?.participants??[]){if(row.family==='original'){await row.parts.sources.revisions?.close();await row.parts.sources.suggestions?.close();await row.parts.sources.versions?.close();await row.parts.session.discardAndClose();}else await row.parts.source.session.discardAndClose();row.parts.uploads.close();}}
for(const [itemIndex,item]of fixtures.manifest.cases.entries())for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`actual seven-writer native read preserves bytes and custody: profile=${itemIndex}/${documentSegmented}/${reviewSegmented}`,async()=>{
 const tag='native-read-'+itemIndex+'-'+Number(documentSegmented)+Number(reviewSegmented),f=await sevenFamilyRoomFixture({fixtures,item,documentSegmented,reviewSegmented,tag});let catalog,owner,parts;
 try{
  await f.closeWriters();catalog=await Catalog.begin({...f.options,database:tag+'-catalog',archive:f.archive,expected:f.archive.selection()});owner=await Operation.begin({...f.options,database:tag+'-intent',expected:f.archive.selection(),catalog,participants:f.participants});await owner.finish();const progress=await owner.progress();
  const before=await snapshotReadDatabases();assert.deepEqual(await snapshotReadDatabases(),before,'The native fixture is quiescent before inspection');
  for(let cycle=0;cycle<2;cycle++){
   const report=await owner.readNative();assert.equal(report.format,'breditor/physical-room-operation-native-read');assert.equal(report.participants.length,7);assert.equal(report.kind,'pending');assert.equal(report.registeredStreamsCovered,false);assert.deepEqual(report.unreconciledParticipants,[]);
   assert.equal(report.missing.filter(row=>row.kind==='document').length,0);assert.equal(report.missing.filter(row=>row.kind==='review').length,3);assert.equal(report.missing.filter(row=>row.kind==='unbound_review').length,3);
   for(const row of report.participants){assert.ok(BigInt(row.document.localThrough)>=BigInt(row.document.acceptedThrough));assert.ok(row.review);assert.equal(row.review.binding===null,['independent-local','local-operation-snapshot','local-operation-flat'].includes(row.family));}
   for(const row of progress.participants){const database=row.namespaces.find(value=>value.role==='operation').database;await assert.rejects(RecoveryLease.acquire(JSON.stringify(database)),error=>error.code==='recovery_in_use');}
   for(const database of [tag+'-intent',tag+'-catalog'])await assert.rejects(RecoveryLease.acquire(JSON.stringify(database)),error=>error.code==='recovery_in_use');
   assert.deepEqual(await owner.progress(),progress);assert.deepEqual(await snapshotReadDatabases(),before,'A native read must not flush or change any committed store');
  }
  parts=await owner.intoParts();
  for(const selected of f.participants){const row=parts.participants.find(row=>row.id===selected.id);await verifyV3RecoveredParticipant(selected,f.source,row.parts);const core=row.family==='original'?row.parts.session.core:row.parts.source.session.core;assert.equal(core.redo(),true);assert.equal(core.undo(),true);assert.equal(core.redoReview().kind,'committed');assert.equal(core.undoReview().kind,'committed');}
  assert.equal(f.counts.networkCalls,0);
 }catch(error){console.error('Native-read failure chain',internalFailureChain(error).map(value=>({name:value.name,code:value.code,message:value.message,stack:value.stack})));throw error;}
 finally{try{await retire(parts);}finally{try{await owner?.discardAndClose();}finally{try{await catalog?.close();}finally{await f.close();}}}}
});
test('late leaf cancellation returns no native read and preserves all coordinator custody for cold recovery',async()=>{
 const tag='native-read-late-abort',f=await sevenFamilyRoomFixture({fixtures,tag}),controller=new AbortController(),freeze=Object.freeze;let armed=false,aborted=false,lateSignalReads=0,catalog,owner,parts;
 Object.defineProperty(controller.signal,'aborted',{get(){if(armed)lateSignalReads++;return false;}});
 const participants=f.participants.map(row=>row.family==='original'?{...row,signal:controller.signal}:row),options={...f.options,database:tag+'-intent',expected:f.archive.selection(),participants,checkAuthority(){if(armed&&!aborted){aborted=true;controller.abort();}}};
 try{
  await f.closeWriters();catalog=await Catalog.begin({...f.options,database:tag+'-catalog',archive:f.archive,expected:f.archive.selection()});owner=await Operation.begin({...options,catalog});await owner.finish();const before=await snapshotReadDatabases(),progress=await owner.progress();
  Object.freeze=function(value){if(value?.format==='breditor/physical-room-operation-native-read')armed=true;return freeze(value);};
  await assert.rejects(owner.readNative());Object.freeze=freeze;armed=false;assert.equal(aborted,true,'Fault must occur after result construction');assert.equal(lateSignalReads,0,'The final fence never calls the caller signal getter');assert.deepEqual(await snapshotReadDatabases(),before);
  for(const row of progress.participants)await assert.rejects(RecoveryLease.acquire(JSON.stringify(row.namespaces.find(value=>value.role==='operation').database)),error=>error.code==='recovery_in_use');
  await owner.discardAndClose();owner=await Operation.resume({...options,participants:f.participants,catalogDatabase:tag+'-catalog'});await owner.finish();assert.equal((await owner.readNative()).participants.length,7);parts=await owner.intoParts();for(const selected of f.participants)await verifyV3RecoveredParticipant(selected,f.source,parts.participants.find(row=>row.id===selected.id).parts);
 }finally{Object.freeze=freeze;armed=false;try{await retire(parts);}finally{try{await owner?.discardAndClose();}finally{try{await catalog?.close();}finally{await f.close();}}}}
});
