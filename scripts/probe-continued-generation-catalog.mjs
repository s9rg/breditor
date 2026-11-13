/** Verify a continued participant through the ordinary catalog and cold recovery entry points. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IDBObjectStore} from 'fake-indexeddb';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel,pixelAsset,secondPixel,secondAsset} from './fixtures/review-assets/pixels.mjs';

const [runtimeDirectory,manifestPath]=process.argv.slice(2);
assert.equal(process.argv.length,4);
const api=await import('../packages/breditor-collaboration/dist/index.js');
const {RichAssetStore}=await import('../packages/breditor-experimental-rich-content/index.js');
const runtime=await import(pathToFileURL(resolve(runtimeDirectory,'breditor_shared.js')).href);
await runtime.default({module_or_path:readFileSync(resolve(runtimeDirectory,'breditor_shared_bg.wasm'))});
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const candidate=manifest.cases.find(row=>{
 const fixture=JSON.parse(readFileSync(row.path,'utf8'));
 return fixture.language===3&&fixture.atomic&&fixture.standard;
});
assert.ok(candidate);
const fixture=JSON.parse(readFileSync(candidate.path,'utf8'));
const metadata=JSON.parse(fixture.inventoryJson);
const client=fixture.clients.find(row=>!row.observer);
assert.ok(client);
const {imageNode,paragraph,SharedSegmentedPersistentSession:Session,SharedRoomRecoveryCatalogArchiveV2:Archive,SharedRoomRecoveryCatalogV2:Catalog,
 SharedGenerationParticipantRecovery:Recovery}=api;
const profile=runtime.SharedRichProfile.from_standard_configuration_json_v3(fixture.configuration);
const stopEnvironment=environment();
const room=metadata.room.document,writer=client.writer,principal=client.principal;
const {inventoryJson,selected}=fixture;
const policy={room,writer,richLanguage:3,history:'explicit',rangeEditing:'original',selectionEditing:'original',
 searchHistory:null,reviewedHistory:null,readOnly:false,review:{actor:client.actor,principal,access:'comment'},profile};
const sourceOptions={...policy,database:'continued-participant-origin'};
const command=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const partsOptions={database:'continued-participant-restore',destinations:{source:'restored-source',uploads:'restored-uploads'},session:{kind:'continued-local',options:policy}};
let session,uploads,backup,archive,catalog,attempt,ready,parts;
try{
 session=await Session.open({...sourceOptions,create:()=>profile.restore(room,client.documentCheckpoint),
  restoreSegmented:checkpoint=>profile.restore_segmented(room,checkpoint),initialGenerations:{root:'original-root',active:'original-active'},
  initialReviewCheckpoint:client.reviewCheckpoint});
 assert.equal(command(session.core,'Offline retained before continuation '),true);
 const image=imageNode('retained-image-block','retained-image',pixelAsset,'initial-raster','Historical raster','retained-caption',{width:1,height:1});
 image.children=[paragraph('retained-caption','Caption retained through recovery')];
 assert.equal(session.core.dispatch({commands:[{kind:'insert_blocks',data:{parent:null,before:null,nodes:[image]}}]}),true);
 const anchor=session.core.captureReviewAnchor({kind:'document'});
 assert.equal(session.core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Comment before continuation'}}).kind,'committed');
 const firstVersion=session.saveVersion('Before continuation','1');
 const predecessor=session.exportRecovery();
 await session.close();session=undefined;
 session=await Session.continueHistory({...sourceOptions,expected:predecessor,nextGeneration:'continued'});
 assert.equal(command(session.core,'Offline retained after continuation '),true);
 assert.equal(session.core.dispatch({commands:[{kind:'replace_image',data:{block:'retained-image-block',asset:secondAsset,generation:'future-raster'}}]}),true);
 const newVersion=session.saveVersion('After continuation','2');
 assert.equal(session.core.undo(),true);
 assert.equal(session.core.undoReview().kind,'committed');
 await session.flush();
 const before=await session.exportContinuedBackup();
 const accepted=metadata.writers.find(row=>row.clock.writer===writer).clock;
 const offline=session.core.writerGroupsV2(accepted.through);
 assert.ok(offline.groups.length>=2);
 uploads=await RichAssetStore.open('continued-uploads');
 const first=await uploads.cacheRemote(pixelAsset,new Blob([pixel],{type:'image/png'}),'fixture/provider-receipt');
 await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));
 await uploads.cancel(secondAsset);
 const source={kind:'continued-local',session},capture=()=>api.captureSharedGenerationParticipant({
  participant:'continued-participant',principal,source,assets:uploads,checkAuthority(){},
 });
 assert.throws(()=>api.captureSharedGenerationSource({kind:'local',session}));
 const captured=await capture();
 assert.equal(captured.kind,'ready');backup=captured.backup;
 assert.deepEqual(backup.sourceRecovery(),before);
 assert.ok(backup.uploadBlob(first.asset));
 assert.ok(backup.blob(pixelAsset,'initial-raster'));
 assert.ok(backup.blob(secondAsset,'future-raster'));
 assert.deepEqual(new Uint8Array(await backup.blob(secondAsset,'future-raster').arrayBuffer()),new Uint8Array(secondPixel));
 assert.deepEqual(new Uint8Array(await backup.uploadBlob(first.asset).arrayBuffer()),new Uint8Array(pixel));
 const uploadBytes=await backup.uploadBackup().arrayBuffer();
 const participantFile=backup.file(),expected=backup.selection();
 await session.close();session=undefined;uploads.close();uploads=undefined;

 const server=new Blob([readFileSync(join(dirname(candidate.path),'server.backup'))]);
 archive=await Archive.capture({catalog:'continued-catalog',inventory:{file:new Blob([inventoryJson]),expected:selected},
  server:{file:server,expected:{bytes:server.size,sha256:sha(new Uint8Array(await server.arrayBuffer()))}},
  participants:[{id:'continued-participant',family:'generation',file:participantFile,expected}],checkAuthority(){}});
 const open={database:'catalog',expected:archive.selection(),checkAuthority(){}};
 const requests=[{id:'continued-participant',family:'generation',recovery:partsOptions}];
 catalog=await Catalog.begin({...open,archive});
 // A failed destination transaction can be resumed through the same selected catalog.
 const add=IDBObjectStore.prototype.add;
 let interrupted=0;
 IDBObjectStore.prototype.add=function(value,key){
  const result=add.call(this,value,key);
  if(this.transaction.db.name===partsOptions.destinations.source&&this.name==='generation_heads'&&key?.at(-1)==='continued-from'){
   interrupted++;this.transaction.abort();
  }
  return result;
 };
 try{await assert.rejects(catalog.stage(requests));}
 finally{IDBObjectStore.prototype.add=add;}
 assert.equal(interrupted,1);
 assert.ok(!(await indexedDB.databases()).some(row=>row.name===partsOptions.destinations.source));
 await catalog.close();catalog=undefined;
 catalog=await Catalog.resume(open);
 const staged=await catalog.stage(requests);
 assert.deepEqual(staged.stagedParticipants,['continued-participant']);
 assert.equal(staged.kind,'pending');
 const document=staged.coverage.checkedParticipants.find(row=>row.writer===writer);
 assert.equal(document.acceptedThrough,accepted.through);
 assert.ok(BigInt(document.localThrough)>BigInt(accepted.through));
 assert.ok(staged.coverage.missing.some(row=>row.kind==='unbound_review'&&row.actor===client.actor));
 assert.equal(sha(new Uint8Array(await catalog.participantFile('continued-participant').arrayBuffer())),expected.sha256);
 await catalog.close();catalog=undefined;

 attempt=await Recovery.resume({...partsOptions,expected,checkAuthority(){}});
 ready=await attempt.finish();
 parts=await ready.intoParts();
 const restored=parts.source.session;
 assert.equal(parts.source.kind,'continued-local');
 assert.deepEqual(await restored.exportContinuedBackup(),before);
 assert.deepEqual(restored.core.writerGroupsV2(accepted.through),offline);
 assert.equal(restored.versionPacket(firstVersion.id),before.predecessor.versions[0]);
 assert.equal(restored.versionPacket(newVersion.id),before.current.versions[1]);
 assert.deepEqual(await (await parts.uploads.exportBackup()).arrayBuffer(),uploadBytes);
 assert.equal((await parts.uploads.get(pixelAsset)).storageRef,'fixture/provider-receipt');
 assert.equal((await parts.uploads.get(secondAsset)).status,'cancelled');
 assert.equal(restored.core.redo(),true);
 assert.equal(restored.core.redoReview().kind,'committed');
 await restored.flush();
 assert.deepEqual((await restored.exportContinuedBackup()).predecessor,predecessor);
 console.log(JSON.stringify({passed:true,interrupted,exactPredecessor:true,documentAndCommentRedo:true,
  exactUploadStore:true,retainedRasters:2,uploadReceipt:true,versionPackets:2,offlineGroups:offline.groups.length,nativeInventoryPrefix:true,unboundReview:true}));
}finally{
 try{
  await parts?.source.session.discardAndClose();parts?.uploads.close();
  await ready?.discardAndClose();await attempt?.close();await catalog?.discardAndClose();
  await session?.discardAndClose();uploads?.close();backup?.dispose();archive?.dispose();
 }finally{profile.free();stopEnvironment();}
}
