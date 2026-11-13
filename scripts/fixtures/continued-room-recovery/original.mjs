import assert from 'node:assert/strict';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {IDBDatabase} from 'fake-indexeddb';
import {databaseValues,recoveryFaults} from '../independent-delivery-recovery/storage.mjs';
import {pendingDelivery} from '../independent-delivery/session.mjs';
import {offlineTransport} from '../room-participant-inventory/participant.mjs';
import {pixel,pixelAsset,secondPixel,secondAsset} from '../review-assets/pixels.mjs';

export async function probeOriginalRecovery({profile,fixture,metadata,initialCatalog,client,continued}){
 const id='original-archive',room=metadata.room.document,{writer,actor,principal}=client;
 const native={room,writer,richLanguage:fixture.language,history:'explicit',rangeEditing:'original',selectionEditing:'original'};
 const connection={endpoint:'ws://127.0.0.1:1/ws',room,principal,documentWriter:writer,...(fixture.atomic?{writerTransport:'atomic-v2'}:{})};
 const versions={identity:{...connection,binding:metadata.versionsBinding}};
 const suggestions=fixture.atomic?{identity:{...connection,binding:metadata.suggestionsBinding,
  effectWriter:metadata.serverAuthors.find(row=>row.kind==='suggestionEffect').clock.writer}}:undefined;
 const revisions=fixture.atomic?{binding:metadata.revisionsBinding}:undefined;
 const relay={endpoint:connection.endpoint,principal,room,actor,binding:metadata.review.binding,documentWriter:writer,
  ...(fixture.atomic?{writerTransport:'atomic-v2'}:{})};
 const options={...native,review:{actor,principal,access:'moderate'},relay,restore:checkpoint=>profile.restore(room,checkpoint)};
 const identity={...native,searchHistory:null};
 const staging=new api.SharedRichEditor(options.restore(client.documentCheckpoint));
 let documentCheckpointJson,reviewCheckpointJson;
 try{
  staging.enableReview(options.review,client.reviewCheckpoint);
  documentCheckpointJson=staging.checkpointJson();reviewCheckpointJson=staging.reviewCheckpoint();
 }finally{staging.dispose();}
 const seed=await api.encodeSharedPairedSessionBackup(identity,{
  format:'breditor/shared-review-relay-checkpoint-record',formatVersion:1,history:native.history,rangeEditing:native.rangeEditing,
  selectionEditing:native.selectionEditing,richLanguage:native.richLanguage,reviewActor:actor,principal,
  documentCheckpointJson,reviewCheckpointJson,versions:[],relay,
  progress:{cursor:null,accepted:null,sequence:null},
 });
 const faults=recoveryFaults(),counts={networkCalls:0};
 const getToken=()=>{counts.networkCalls++;throw Error('Recovery must remain offline');},transport=offlineTransport(counts);
 let session,queue,outbox,catalog,uploads,backup,documentBackup,archive,store;
 try{
  session=await api.SharedReviewPersistentSession.restoreBackup({...options,database:id+'-source',backupJson:seed,writerRecovery:'host-reacquired'});
  const core=session.core;
  if(fixture.language===1){
   assert.equal(core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Original offline history '}}]}),true);
  }else{
   const image=api.imageNode('original-recovered-image','original-raster',pixelAsset,'original-generation','Original offline image','original-caption',{width:1,height:1});
   assert.equal(core.dispatch({commands:[{kind:'insert_blocks',data:{parent:null,before:null,nodes:[image]}}]}),true);
  }
  assert.equal(core.undo(),true);
  assert.equal(core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Original offline review'}}).kind,'committed');
  assert.equal(core.undoReview().kind,'committed');
  session.saveVersion('Original local version','4');
  await session.flush();
  uploads=await RichAssetStore.open(id+'-uploads');
  await uploads.ingest(new Blob([pixel],{type:'image/png'}));
  await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));
  await uploads.cancel(secondAsset);
  catalog=await api.SharedDocumentVersions.open({...versions,database:id+'-versions',storage:session,getToken,autoConnect:false});
  if(suggestions){
   queue=await api.SharedSuggestionQueue.open({...suggestions,database:id+'-suggestions',storage:session});
   outbox=await api.SharedSuggestionRevisions.open({...revisions,database:id+'-revisions',storage:session,queue,transport,autoStart:false});
   await pendingDelivery(session,{queue,revisions:outbox,versions:catalog});
  }else{
   catalog.saveVersion('Original queued version','3');await catalog.flush();
  }
  const captured=await api.captureSharedParticipantBackup({identity:{participant:id,principal,source:identity,
   stores:['document','paired-session','version-catalog',...(queue?['suggestions','suggestion-revisions']:[])],assets:'whole-store'},
   source:{core,session,versions:catalog,...(queue?{suggestions:queue,revisions:outbox}:{})},assets:uploads,checkAuthority(){}});
  assert.equal(captured.kind,'ready');backup=captured.backup;
  const document=await api.captureSharedParticipantBackup({identity:{participant:'original-document',principal,source:identity,
   stores:['document'],assets:'whole-store'},source:{core},assets:uploads,checkAuthority(){}});
  assert.equal(document.kind,'ready');documentBackup=document.backup;
  await outbox?.discardAndClose();outbox=undefined;await queue?.discardAndClose();queue=undefined;
  await catalog.discardAndClose();catalog=undefined;await session.discardAndClose();session=undefined;
  uploads.close();uploads=undefined;
  const expected=backup.selection(),catalogOptions={...initialCatalog,
   policies:[{id:continued.id,expected:continued.expected,restoreDocument:continued.restoreDocument}]};
  archive=await api.SharedContinuedRoomCatalog.capture({...catalogOptions,participants:[
   {id,family:'original',file:backup.file(),expected},{id:continued.id,file:continued.file,expected:continued.expected},
  ]});
  const stored={database:id+'-catalog',expected:archive.selection(),wasm:catalogOptions.wasm,checkAuthority(){},policies:catalogOptions.policies};
  store=await api.SharedContinuedRoomCatalogStore.begin({...stored,archive});
  const destination={id,source:id+'-restored-source',uploads:id+'-restored-uploads',original:{
   ...(suggestions?{suggestions:id+'-restored-suggestions',revisions:id+'-restored-revisions'}:{}),versions:id+'-restored-versions',
  }};
  const later={id:continued.id,source:id+'-continued-source',uploads:id+'-continued-uploads'};
  const policy={id,expected,session:{kind:'paired',options},versions,...(suggestions?{suggestions,revisions}:{})};
  let allowed=true;
  const plan={catalog:store,expected:archive.selection(),database:id+'-root',writerRecovery:'host-reacquired',checkAuthority(){assert.equal(allowed,true);},
   destinations:[destination,later],originalPolicies:[policy]};
  await assert.rejects(api.beginContinuedRoomRecovery({...plan,originalPolicies:[]}),error=>error.code==='continued_room_recovery_policy');
  await assert.rejects(api.beginContinuedRoomRecovery({...plan,destinations:[{...destination,original:{}},later]}));
  await assert.rejects(api.beginContinuedRoomRecovery({...plan,originalPolicies:[{...policy,versions:{identity:{...versions.identity,binding:'0'.repeat(64)}}}]}),
   error=>error.code==='recovery_policy');
  assert.ok(!(await indexedDB.databases()).some(row=>row.name===plan.database));
  const lastPacket=destination.original.versions;
  faults.select(lastPacket,'catalogs',1,'lost-ack');
  await assert.rejects(api.beginContinuedRoomRecovery(plan));
  assert.equal(faults.observed.at(-1).database,lastPacket);
  assert.ok(!(await indexedDB.databases()).some(row=>[destination.uploads,later.source].includes(row.name)));
  await store.close();store=await api.SharedContinuedRoomCatalogStore.resume(stored);
  const resumed={...plan,catalog:store},transaction=IDBDatabase.prototype.transaction;
  const packetNames=new Set([destination.source,...Object.values(destination.original)]);
  const noWrites=async(names,work)=>{
   IDBDatabase.prototype.transaction=function(...args){
    assert.ok(!names.has(this.name)||args[1]!=='readwrite',`Cold original recovery wrote ${this.name}`);
    return transaction.apply(this,args);
   };
   try{return await work();}finally{IDBDatabase.prototype.transaction=transaction;}
  };
  await noWrites(packetNames,async()=>assert.deepEqual((await api.resumeContinuedRoomRecovery(resumed)).participants,[destination,later]));
  packetNames.add(destination.uploads);
  const revoked={...policy,session:{...policy.session,options:{...options,restore(checkpoint){
   const owner=options.restore(checkpoint);allowed=false;return owner;
  }}}};
  try{
   await noWrites(packetNames,()=>assert.rejects(api.resumeContinuedRoomRecovery({...resumed,originalPolicies:[revoked]}),
    error=>error.code==='participant_authority'));
  }finally{allowed=true;}
  await noWrites(packetNames,async()=>assert.deepEqual((await api.resumeContinuedRoomRecovery(resumed)).participants,[destination,later]));
  const records=new Map(backup.records().map(row=>[row.kind,row.json]));
  const recordDatabases=[[destination.source,'journals','paired-session'],[destination.original.versions,'catalogs','version-catalog'],
   ...(suggestions?[[destination.original.suggestions,'suggestions','suggestions'],[destination.original.revisions,'revisions','suggestion-revisions']]:[])];
  for(const [database,storeName,kind] of recordDatabases){
   const {values}= (await databaseValues(database))[storeName];
   assert.equal(values.length,1);
   assert.equal(JSON.stringify(values[0]),records.get(kind));
  }
  uploads=await RichAssetStore.openRetained(destination.uploads);
  assert.deepEqual(Buffer.from(await (await uploads.exportBackup()).arrayBuffer()),Buffer.from(await backup.uploadBackup().arrayBuffer()));
  assert.equal((await uploads.get(secondAsset)).status,'cancelled');
  if(fixture.language!==1)assert.deepEqual(Buffer.from(await backup.blob(pixelAsset,'original-generation').arrayBuffer()),Buffer.from(pixel));
  uploads.close();uploads=undefined;
  session=await api.SharedReviewPersistentSession.open({...options,database:destination.source,create(){throw Error('Existing source required');}});
  assert.equal(JSON.stringify(session.exportRecovery()),records.get('paired-session'));
  assert.equal(session.core.redo(),true);
  assert.match(session.core.documentJson(),fixture.language===1?/Original offline history/:/original-recovered-image/);
  assert.equal(session.core.redoReview().kind,'committed');
  assert.match(JSON.stringify(session.core.reviewSnapshot().view),/Original offline review/);
  assert.equal(session.core.undo(),true);
  assert.equal(session.core.undoReview().kind,'committed');
  await session.flush();await session.discardAndClose();session=undefined;
  const changed=await databaseValues(destination.source);
  await noWrites(packetNames,()=>assert.rejects(api.resumeContinuedRoomRecovery(resumed),error=>error.code==='recovery_diverged'));
  assert.deepEqual(await databaseValues(destination.source),changed);
  assert.equal(counts.networkCalls,0);

  const originalDocument={id:'original-document',source:id+'-document-only',uploads:id+'-document-uploads',original:{}};
  const documentPeer={...later,source:later.source+'-doc-only',uploads:later.uploads+'-doc-only'};
  await probeOriginalDocumentRecovery({catalogOptions,stored,continued,originalDocument,documentPeer,options,documentBackup});
  return {originalColdRestores:1,originalPacketRestores:recordDatabases.length-1,originalChangedRefusals:1,originalDocumentRestores:1};
 }finally{
  faults.restore();await store?.close();archive?.dispose();backup?.dispose();documentBackup?.dispose();
  await outbox?.discardAndClose();await queue?.discardAndClose();await catalog?.discardAndClose();await session?.discardAndClose();uploads?.close();
 }
}


async function probeOriginalDocumentRecovery({catalogOptions,stored,continued,originalDocument,documentPeer,options,documentBackup}){
 const expected=documentBackup.selection(),{review,relay,selectionEditing,...documentOptions}=options;
 const archive=await api.SharedContinuedRoomCatalog.capture({...catalogOptions,participants:[
  {id:originalDocument.id,family:'original',expected,file:documentBackup.file()},
  {id:continued.id,file:continued.file,expected:continued.expected},
 ]});
 let store,session;
 try{
  store=await api.SharedContinuedRoomCatalogStore.begin({...stored,database:'original-document-catalog',expected:archive.selection(),archive});
  const plan={catalog:store,expected:archive.selection(),database:'original-document-root',writerRecovery:'host-reacquired',checkAuthority(){},
   destinations:[originalDocument,documentPeer],
   originalPolicies:[{id:originalDocument.id,expected,session:{kind:'document',options:documentOptions}}]};
  await assert.rejects(api.beginContinuedRoomRecovery({...plan,destinations:[{...originalDocument,uploads:documentPeer.source},documentPeer]}),
   error=>error.code==='continued_room_recovery_policy');
  assert.deepEqual((await api.beginContinuedRoomRecovery(plan)).participants,[originalDocument,documentPeer]);
  assert.deepEqual((await api.resumeContinuedRoomRecovery(plan)).participants,[originalDocument,documentPeer]);
  session=await api.SharedPersistentSession.open({...documentOptions,database:originalDocument.source,create(){throw Error('Existing document required');}});
  assert.equal(session.core.checkpointJson(),documentBackup.records()[0].json);
  await session.discardAndClose();session=undefined;
  await new Promise((resolve,reject)=>{
   const request=indexedDB.deleteDatabase(originalDocument.source);
   request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Original source lease leaked'));
  });
  await assert.rejects(api.resumeContinuedRoomRecovery(plan),error=>error.code==='recovery_missing');
  assert.ok(!(await indexedDB.databases()).some(row=>row.name===originalDocument.source));
 }finally{await session?.discardAndClose();await store?.close();archive.dispose();}
}
