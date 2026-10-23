/** Genuine document-only captures and operational owners. An unselected native
 * review lane is tested on an actual read capsule, not by inventing a clock or
 * relabelling a paired backup. Neither case grants comment-stream coverage. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {sevenNativeFixtures} from '../physical-operation-v3/seven-native.mjs';
import {sevenFamilyRoomFixture} from '../physical-operation-v3/seven-room.mjs';
import {snapshotReadDatabases} from './storage-snapshot.mjs';
import {PhysicalRoomCatalogV3Archive as Archive,physicalCatalogV3ArchiveState} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/archive.js';
import {PhysicalRoomCatalogV3 as Catalog} from '../../../packages/breditor-collaboration/dist/physical_room_catalog_v3/catalog.js';
import {PhysicalRoomClientOperationV3 as Operation} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/operation.js';
import {preflightPhysicalOperationV3} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/preflight.js';
import {inspectPhysicalOperationV3Native} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/native_read.js';
import {capturedNativeHistoryRead,capturedNativeHistoryFinalCheck} from '../../../packages/breditor-collaboration/dist/native_history_read/registry.js';
import {RecoveryLease} from '../../../packages/breditor-collaboration/dist/participant_recovery/lease.js';
const fixtures=await sevenNativeFixtures();

async function documentOnly(item,tag){
 const f=await sevenFamilyRoomFixture({fixtures,item,tag});let backup,archive;
 try{
  const original=f.rows.find(row=>row.family==='original'),identity=original.expected.identity;
  const captured=await api.captureSharedParticipantBackup({identity:{...identity,stores:['document']},source:{core:original.owner.recovered.sources.core},assets:original.owner.recovered.uploads,checkAuthority(){}});
  assert.equal(captured.kind,'ready');backup=captured.backup;
  assert.deepEqual(backup.selection().identity.stores,['document']);
  const metadata=f.source.metadata,files=f.source.files;
  archive=await Archive.capture({...f.options,catalog:tag+'-doc-only',origin:{file:files.get('origin-server'),expected:metadata.origin.identity},current:{server:{file:files.get('current-server'),expected:metadata.current.server.identity},participants:{file:files.get('inventory'),expected:metadata.current.participants.identity}},participants:f.rows.map(row=>({id:row.id,family:row.family,file:row.family==='original'?backup.file():row.file,expected:row.family==='original'?backup.selection():row.expected}))});
  const native=identity.source,participant={id:'original',family:'original',operationDatabase:tag+'-operation',recovery:{database:tag+'-recovery',destinations:{document:tag+'-document',uploads:tag+'-uploads'},session:{kind:'document',options:{room:native.room,writer:native.writer,richLanguage:native.richLanguage,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,restore:checkpoint=>f.profile.restore(native.room,checkpoint)}}},currentPolicy:{documentReadOnly:false,reviewAccess:null},checkAuthority(){}};
  return{f,backup,archive,source:physicalCatalogV3ArchiveState(archive),participant,core:original.owner.recovered.sources.core,async close(){archive.dispose();backup.dispose();await f.close();}};
 }catch(error){archive?.dispose();backup?.dispose();await f.close();throw error;}
}
function pendingOnlyDocument(report){
 assert.equal(report.participants.length,1);assert.equal(report.participants[0].family,'original');assert.equal(report.participants[0].review,null);
 assert.equal(report.kind,'pending');assert.equal(report.registeredStreamsCovered,false);assert.equal(report.missing.filter(row=>row.kind==='document').length,6);assert.equal(report.missing.filter(row=>row.kind==='review').length,7);assert.equal(report.missing.filter(row=>row.kind==='unbound_review').length,0);assert.equal(report.unreconciledParticipants.length,6);
}

for(const item of fixtures.manifest.cases.slice(0,2)){
 const data=fixtures.fixture(item),wire=data.atomic?2:1;
 test(`an actual unselected review capsule cannot cover registered review streams, wire=${wire}`,async()=>{
  const h=await documentOnly(item,'unselected-review-'+wire);let capture;
  try{
   capture=api.captureSharedAssetReferences({core:h.core});const native=capturedNativeHistoryRead(capture);assert.equal(native.review.kind,'unselected');assert.equal(native.review.nativeKind,'original');
   const selected=preflightPhysicalOperationV3([h.participant],h.source,'unselected-intent-'+wire,'unselected-catalog-'+wire),current=capturedNativeHistoryFinalCheck(native),before=await snapshotReadDatabases();
   // This is a pure predicate law, not an operational-owner or activation DTO.
   // The capsule, admitted document-only file and native inventory are genuine.
   const read={participants:[{id:'original',family:'original',native}],checkCurrent:current};
   pendingOnlyDocument(inspectPhysicalOperationV3Native(h.source,selected,read));current();assert.deepEqual(await snapshotReadDatabases(),before);
  }finally{capture?.dispose();await h.close();}
 });
 test(`document-only operational read cold-reopens with no selected review, wire=${wire}`,async()=>{
  const tag='document-only-operation-'+wire,h=await documentOnly(item,tag);let catalog,owner,parts,capture;
  const options={...h.f.options,database:tag+'-intent',expected:h.archive.selection(),participants:[h.participant]};
  try{
   await h.f.closeWriters();catalog=await Catalog.begin({...h.f.options,database:tag+'-catalog',archive:h.archive,expected:h.archive.selection()});owner=await Operation.begin({...options,catalog});await owner.finish();
   for(let cycle=0;cycle<2;cycle++){
    const before=await snapshotReadDatabases();pendingOnlyDocument(await owner.readNative());assert.deepEqual(await snapshotReadDatabases(),before);
    for(const database of [h.participant.operationDatabase,options.database,tag+'-catalog'])await assert.rejects(RecoveryLease.acquire(JSON.stringify(database)),error=>error.code==='recovery_in_use');
    if(cycle===0){await owner.close();owner=await Operation.resume({...options,catalogDatabase:tag+'-catalog'});await owner.finish();}
   }
   parts=(await owner.intoParts()).participants[0].parts;capture=api.captureSharedAssetReferences(parts.sources);await h.backup.verifyRecovered(capture,parts.uploads);assert.equal(capturedNativeHistoryRead(capture).review.kind,'absent');capture.dispose();capture=undefined;
   const before=parts.session.core.documentJson();assert.equal(parts.session.core.redo(),true);assert.equal(parts.session.core.undo(),true);assert.equal(parts.session.core.documentJson(),before);
  }finally{capture?.dispose();if(parts){await parts.session.discardAndClose();parts.uploads.close();}await owner?.discardAndClose();await catalog?.close();await h.close();}
 });
}
