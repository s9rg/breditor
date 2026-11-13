/** Native client replay against retained physical server files. Storage/locks are simulated. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SharedRichEditor,SharedContinuedPairSession,SharedContinuedParticipantBackup,SharedContinuedRoomCatalog,SharedContinuedRoomCatalogStore,beginContinuedRoomRecovery,resumeContinuedRoomRecovery} from '../packages/breditor-collaboration/dist/index.js';
import {IDBDatabase} from 'fake-indexeddb';
import {RichAssetStore} from '@breditor/experimental-rich-content';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel,secondPixel,secondAsset} from './fixtures/review-assets/pixels.mjs';

async function removeRetainedCatalogFile(database,key){
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open(database);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('physical_room_v4_files','readwrite');
   tx.objectStore('physical_room_v4_files').delete(key);
   tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close();}
}
const bytes=async value=>Buffer.from(await value.arrayBuffer());
const sameBytes=async(a,b)=>assert.deepEqual(await bytes(a),await bytes(b));
const sha=value=>createHash('sha256').update(value).digest('hex');
const local=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});

async function participant(profile,fixture,metadata,client,wasm,tag,documentHistory,reviewHistory,branch='current'){
 const room=metadata.room.document,writer=client.writer;
 const readOnly=client.observer;
 const review={actor:client.actor,principal:client.principal,access:readOnly?'read_only':'comment'};
 const original=branch==='fork-document'?client.forkCheckpoint:branch==='behind'?client.baseCheckpoint:client.documentCheckpoint;
 let raw=profile.restore(room,original),core,session,uploads,backup;
 try{
  let documentCheckpoint=original;
  if(documentHistory==='continued-v2'){
   assert.equal(readOnly,false);
   const boundary=work=>{const observation=raw.observe();try{work(observation);}finally{observation.free();}};
   boundary(o=>raw.enable_segmented_history(o,'root','first'));
   boundary(o=>raw.continue_history(o,'continued'));
   documentCheckpoint=raw.continued_history_checkpoint();
   raw.free();
   raw=profile.restore_continued_history(room,documentCheckpoint);
  }
  core=new SharedRichEditor(raw,documentHistory==='continued-v2'?{segmentedHistory:'continued-v2'}:{});
  raw=undefined;
  const reviewRoot=branch==='fork-review'?client.forkReviewCheckpoint:branch==='behind'?client.emptyReviewCheckpoint:client.reviewCheckpoint;
  core.enableReview(review,reviewRoot);
  if(reviewHistory==='continued-v2'){
   if(readOnly){
    core.enableReadOnlyReviewHistoryGenerations('review-root','review-first');
    core.continueReadOnlyReviewHistory('review-continued');
   }else{
    core.enableReviewHistoryGenerations('review-root','review-first');
    core.continueReviewHistory('review-continued');
   }
  }
  const reviewCheckpoint=reviewHistory==='continued-v2'?core.reviewContinuedCheckpoint():core.reviewCheckpoint();
  documentCheckpoint=core.checkpointJson();
  core.dispose();core=undefined;
  const native={room,writer,richLanguage:fixture.language,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null};
  const restoreDocument=checkpoint=>documentHistory==='continued-v2'?profile.restore_continued_history(room,checkpoint):profile.restore(room,checkpoint);
  const options={database:tag+'-source',native,documentHistory,reviewHistory,readOnly,review,restoreDocument};
  const identity={native,documentHistory,reviewHistory,review:{actor:review.actor,principal:review.principal}};
  session=await SharedContinuedPairSession.restoreRecovery(options,{
   format:'breditor/shared-independent-history-recovery',formatVersion:2,identity,documentCheckpoint,reviewCheckpoint,versions:[],
  },'host-reacquired');
  if(branch==='current'||branch==='interrupted'){
   assert.equal(local(session.core,'Local offline document '),true);
   session.core.undo();
   assert.equal(session.core.dispatchReview({kind:'create_thread',data:{anchorJson:session.core.captureReviewAnchor({kind:'document'}),body:'Local offline comment'}}).kind,'committed');
   session.core.undoReview();
   await session.retainVersion(session.core.captureVersion('Local retained version',client.principal,'11'));
  }
  await session.flush();
  if(branch==='interrupted'){
   const original=IDBDatabase.prototype.transaction;
   let injected=false;
   IDBDatabase.prototype.transaction=function(...args){
    const tx=original.apply(this,args);
    if(this.name===options.database&&args[1]==='readwrite'&&!injected){
     injected=true;queueMicrotask(()=>{try{tx.abort();}catch{}});
    }
    return tx;
   };
   try{
    assert.equal(local(session.core,'Attempted offline save '),true);
    assert.equal(local(session.core,'Later pending save '),true);
    await assert.rejects(session.flush());
    assert.equal(injected,true);
   }finally{IDBDatabase.prototype.transaction=original;}
  }
  uploads=await RichAssetStore.open(tag+'-uploads');
  await uploads.ingest(new Blob([pixel],{type:'image/png'}));
  await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));
  await uploads.cancel(secondAsset);
  const result=await SharedContinuedParticipantBackup.capture({participant:tag,principal:client.principal,session,uploads,wasm,checkAuthority(){},
   resolveAsset:async reference=>({...reference,identity:reference.asset.startsWith('sha256:')?'content-addressed':'host-verified',
    blob:new Blob([pixel],{type:'image/png'}),check(){}})});
  assert.equal(result.kind,'ready');backup=result.backup;
  const record=backup.records();
  await (branch==='interrupted'?session.discardAndClose():session.close());session=undefined;
  uploads.close();uploads=undefined;
  return {backup,record,options,client,id:tag,file:backup.file(),expected:backup.selection(),restoreDocument};
 }catch(error){backup?.dispose();throw error;}
 finally{raw?.free();core?.dispose();await session?.discardAndClose();uploads?.close();}
}

export async function probeContinuedRoomCatalog(runtime,fixturePath){
 const wasmBytes=readFileSync(resolve(runtime,'breditor_shared_bg.wasm'));
 const wasm=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')).href);
 await wasm.default({module_or_path:wasmBytes});
 const fixture=JSON.parse(readFileSync(fixturePath,'utf8')),folder=dirname(fixturePath),metadata=JSON.parse(fixture.inventoryJson);
 const make=fixture.language===1?'from_configuration_json':fixture.standard?`from_standard_configuration_json_v${fixture.language}`:`from_configuration_json_v${fixture.language}`;
 const profile=wasm.SharedRichProfile[make](fixture.configuration),reset=environment();
 const client=fixture.clients.find(row=>!row.observer);
 const owners=[],catalogs=[];
 const counts={coldCatalogReads:0,nativePairs:0,serverAhead:0,forksRefused:0,selectionRefusals:0,storedCatalogReads:0,storedCatalogRefusals:0,interruptedCatalogReads:0,damagedCatalogRefusals:0,restoredLocalUndoRedo:0,cohortRecoveries:0,interruptedRecoveryResumes:0,uploadRecoveryResumes:0,recoveryRefusals:0};
 try{
  const initial={
   catalog:'continued-room',wasm,checkAuthority(){},
   origin:{file:new Blob([readFileSync(resolve(folder,'server.backup'))]),expected:fixture.afterRecoveryState.origin},
   current:{
    server:{file:new Blob([readFileSync(resolve(folder,'server-after.backup'))]),expected:fixture.afterRecoveryState.server},
    participants:{file:new Blob([readFileSync(resolve(folder,'inventory-after.json'))]),expected:fixture.afterRecoveryState.participants},
   },
  };
  const pack=async(tag,doc,review,branch,selected=client)=>{
   const result=await participant(profile,fixture,metadata,selected,wasm,tag,doc,review,branch);
   owners.push(result);
   return result;
  };
  const capture=async(rows)=>{
   const catalog=await SharedContinuedRoomCatalog.capture({...initial,
    participants:rows.map(({id,file,expected})=>({id,file,expected})),
    policies:rows.map(({id,expected,restoreDocument})=>({id,expected,restoreDocument})),
   });
   catalogs.push(catalog);
   return catalog;
  };
  for(const [index,[documentHistory,reviewHistory]] of [['continued-v2','original'],['original','continued-v2'],['continued-v2','continued-v2']].entries()){
   const entry=await pack('participant-'+index,documentHistory,reviewHistory);
   const first=await capture([entry]),files=first.files(),selection=first.selection(),manifest=first.manifestJson();
   assert.equal(first.metadata().formatVersion,4);
   assert.equal(first.metadata().participants[0].family,'continued-local');
   first.dispose();
   const read={wasm,checkAuthority(){},policies:[{id:entry.id,expected:entry.expected,restoreDocument:entry.restoreDocument}]};
   const reopened=await SharedContinuedRoomCatalog.read(manifest,files,selection,read);catalogs.push(reopened);
   const observed=reopened.inspectPrefixes();
   assert.deepEqual(observed.source,fixture.afterRecoveryState.participants);
   assert.equal(observed.coverage.kind,'pending');
   assert.ok(observed.coverage.missing.some(row=>row.kind==='unbound_review'&&row.actor===client.actor));
   assert.equal(observed.participants[0].prefix.documentStatus,'matches');
   assert.equal(observed.participants[0].prefix.review.status,'matches');
   assert.ok(BigInt(observed.participants[0].prefix.document.localThrough)>BigInt(observed.participants[0].prefix.document.acceptedThrough));
   assert.ok(BigInt(observed.participants[0].prefix.review.localThrough)>BigInt(observed.participants[0].prefix.review.acceptedThrough));
   assert.deepEqual(reopened.participantRecords(entry.id),entry.record);
   for(const [name,file] of reopened.files())await sameBytes(file,files.get(name));
   counts.coldCatalogReads++;
   counts.nativePairs++;
   const open={...read,expected:selection,database:entry.id+'-catalog'};
   let stored;
   try{
    await assert.rejects(SharedContinuedRoomCatalogStore.resume(open),error=>error.code==='catalog_missing');
    stored=await SharedContinuedRoomCatalogStore.begin({...open,archive:reopened});
    assert.deepEqual(stored.inspectPrefixes(),observed);
    await assert.rejects(SharedContinuedRoomCatalogStore.resume(open),error=>error.code==='catalog_in_use');
    await stored.close();
    stored=await SharedContinuedRoomCatalogStore.resume(open);
    assert.deepEqual(stored.participantRecords(entry.id),entry.record);
    await sameBytes(stored.participantFile(entry.id),entry.file);
    await stored.close();
    await assert.rejects(SharedContinuedRoomCatalogStore.begin({...open,archive:reopened}),error=>error.code==='catalog_exists');
    stored=await SharedContinuedRoomCatalogStore.resume(open);
    assert.deepEqual(stored.inspectPrefixes(),observed);
    counts.storedCatalogReads++;
    counts.storedCatalogRefusals+=3;
   }finally{await stored?.close();}
   const restored=await SharedContinuedPairSession.restoreRecovery({...entry.options,database:entry.id+'-new'},
    reopened.participantRecords(entry.id).live,'host-reacquired');
   try{
    assert.equal(restored.core.redo(),true);
    assert.equal(restored.core.redoReview().kind,'committed');
    assert.match(restored.core.documentJson(),/Local offline document/);
    assert.match(JSON.stringify(restored.core.reviewSnapshot().view),/Local offline comment/);
    counts.restoredLocalUndoRedo++;
   }finally{await restored.close();}
   const otherFiles=new Map(files);
   const currentFile=otherFiles.get('current-server');
   const changed=new Uint8Array(await currentFile.arrayBuffer());
   changed[changed.length-1]^=1;
   otherFiles.set('current-server',new Blob([changed]));
   let restoreCalls=0;
   const guard={...read,policies:[{...read.policies[0],restoreDocument:checkpoint=>{restoreCalls++;return entry.restoreDocument(checkpoint);}}]};
   await assert.rejects(SharedContinuedRoomCatalog.read(manifest,files,selection,{...guard,policies:[]}));
   await assert.rejects(SharedContinuedRoomCatalog.read(manifest,files,{...selection,sha256:'0'.repeat(64)},guard));
   const incomplete=new Map(files);incomplete.delete('inventory');
   await assert.rejects(SharedContinuedRoomCatalog.read(manifest,incomplete,selection,guard));
   await assert.rejects(SharedContinuedRoomCatalog.read(manifest,otherFiles,selection,guard));
   assert.equal(restoreCalls,0);
   counts.selectionRefusals+=4;
   const duplicate={...entry,id:entry.id+'-duplicate'};
   await assert.rejects(capture([entry,duplicate]),error=>error.code==='inventory_duplicate');
   counts.selectionRefusals++;
   reopened.dispose();
   assert.throws(()=>reopened.inspectPrefixes(),error=>error.code==='catalog_closed');
  }
  const interrupted=await pack('interrupted','continued-v2','continued-v2','interrupted');
  const captured=await capture([interrupted]);
  const options={wasm,checkAuthority(){},expected:captured.selection(),database:'interrupted-catalog',
   policies:[{id:interrupted.id,expected:interrupted.expected,restoreDocument:interrupted.restoreDocument}]};
  let interruptedStore;
  try{
   interruptedStore=await SharedContinuedRoomCatalogStore.begin({...options,archive:captured});
   await interruptedStore.close();
   interruptedStore=await SharedContinuedRoomCatalogStore.resume(options);
   const recovered=interruptedStore.participantRecords(interrupted.id);
   assert.deepEqual(recovered,interrupted.record);
   assert.ok(recovered.attempt.cut);
   assert.ok(recovered.pending);
   assert.notEqual(recovered.attempt.capture.documentCheckpoint,recovered.committed.recovery.documentCheckpoint);
   assert.notEqual(recovered.attempt.capture.documentCheckpoint,recovered.pending.documentCheckpoint);
   assert.deepEqual(recovered.live,recovered.pending);
   await sameBytes(interruptedStore.participantUploads(interrupted.id),interrupted.backup.uploadBackup());
   const binding=interrupted.backup.metadata().bindings[0];
   if(binding)await sameBytes(interruptedStore.participantAsset(interrupted.id,binding.asset,binding.generation),
    interrupted.backup.blob(binding.asset,binding.generation));
   counts.interruptedCatalogReads++;
  }finally{await interruptedStore?.close();}
  await removeRetainedCatalogFile(options.database,'participant:'+interrupted.id);
  await assert.rejects(SharedContinuedRoomCatalogStore.resume(options),error=>error.code==='catalog_diverged');
  await assert.rejects(SharedContinuedRoomCatalogStore.begin({...options,archive:captured}),error=>error.code==='catalog_exists');
  counts.damagedCatalogRefusals++;
  const observer=await pack('observer','original','continued-v2','observer',fixture.clients.find(row=>row.observer));
  const cohort=await capture([interrupted,observer]);
  const cohortOptions={wasm,checkAuthority(){},expected:cohort.selection(),database:'cohort-catalog',
   policies:[interrupted,observer].map(({id,expected,restoreDocument})=>({id,expected,restoreDocument}))};
  let cohortStore;
  try{
   cohortStore=await SharedContinuedRoomCatalogStore.begin({...cohortOptions,archive:cohort});
   const destinations=[observer,interrupted].map(({id})=>({id,source:id+'-adopted',uploads:id+'-adopted-uploads'}));
   const recovery={database:'cohort-recovery',catalog:cohortStore,expected:cohort.selection(),destinations,writerRecovery:'host-reacquired',checkAuthority(){}};
   const transaction=IDBDatabase.prototype.transaction;
   let interruptedAck=false;
   IDBDatabase.prototype.transaction=function(...args){
    const tx=transaction.apply(this,args);
    if(this.name===interrupted.id+'-adopted'&&args[1]==='readwrite'&&!interruptedAck){
     interruptedAck=true;
     Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});
    }
    return tx;
   };
   try{
    await assert.rejects(beginContinuedRoomRecovery(recovery));
    assert.equal(interruptedAck,true);
   }finally{IDBDatabase.prototype.transaction=transaction;}
   await cohortStore.close();
   cohortStore=await SharedContinuedRoomCatalogStore.resume(cohortOptions);
   let resumed={...recovery,catalog:cohortStore};
   let interruptedUpload=false;
   IDBDatabase.prototype.transaction=function(...args){
    const tx=transaction.apply(this,args);
    if(this.name===observer.id+'-adopted-uploads'&&args[1]==='readwrite'&&!interruptedUpload){
     interruptedUpload=true;
     Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});
    }
    return tx;
   };
   try{
    await assert.rejects(resumeContinuedRoomRecovery(resumed));
    assert.equal(interruptedUpload,true);
   }finally{IDBDatabase.prototype.transaction=transaction;}
   await cohortStore.close();
   cohortStore=await SharedContinuedRoomCatalogStore.resume(cohortOptions);
   resumed={...recovery,catalog:cohortStore};
   const result=await resumeContinuedRoomRecovery(resumed);
   counts.uploadRecoveryResumes++;
   assert.equal(result.participants.length,2);
   assert.deepEqual(await resumeContinuedRoomRecovery(resumed),result);
   counts.interruptedRecoveryResumes++;
   for(const entry of [interrupted,observer]){
    const destination=result.participants.find(row=>row.id===entry.id);
    const session=await SharedContinuedPairSession.open({...entry.options,database:destination.source});
    const uploadStore=await RichAssetStore.openRetained(destination.uploads);
    try{
     assert.deepEqual(session.exportRecovery(),entry.record.live);
     assert.equal((await uploadStore.get(secondAsset)).status,'cancelled');
     await sameBytes(await uploadStore.exportBackup(),entry.backup.uploadBackup());
    }finally{await session.close();uploadStore.close();}
   }
   counts.cohortRecoveries++;
   await assert.rejects(beginContinuedRoomRecovery(resumed),error=>error.code==='continued_room_recovery_exists');
   await assert.rejects(resumeContinuedRoomRecovery({...resumed,destinations:destinations.map(row=>({...row,uploads:row.uploads+'-other'}))}));
   const changed=await SharedContinuedPairSession.open({...interrupted.options,database:interrupted.id+'-adopted'});
   try{assert.equal(local(changed.core,'New edit after local recovery '),true);await changed.flush();}
   finally{await changed.close();}
   await assert.rejects(resumeContinuedRoomRecovery(resumed),error=>error.code==='continued_room_recovery_diverged');
   counts.recoveryRefusals+=3;
  }finally{await cohortStore?.close();}
  const behind=await capture([await pack('behind','continued-v2','continued-v2','behind')]);
  const observed=behind.inspectPrefixes();
  assert.equal(observed.participants[0].prefix.documentStatus,'server_ahead');
  assert.equal(observed.participants[0].prefix.review.status,'server_ahead');
  assert.ok(observed.coverage.missing.some(row=>row.kind==='document'&&row.reason==='server_ahead'));
  counts.serverAhead++;
  for(const branch of ['fork-document','fork-review']){
   const forked=await pack(branch,'continued-v2','continued-v2',branch);
   await assert.rejects(capture([forked]),error=>error.code==='inventory_fork');
   counts.forksRefused++;
  }
  assert.deepEqual(counts,{coldCatalogReads:3,nativePairs:3,serverAhead:1,forksRefused:2,selectionRefusals:15,storedCatalogReads:3,storedCatalogRefusals:9,interruptedCatalogReads:1,damagedCatalogRefusals:1,restoredLocalUndoRedo:3,cohortRecoveries:1,interruptedRecoveryResumes:1,uploadRecoveryResumes:1,recoveryRefusals:3});
  return {passed:true,fixtureSha256:sha(readFileSync(fixturePath)),sharedWasmSha256:sha(wasmBytes),...counts};
 }finally{
  for(const catalog of catalogs)catalog.dispose();
  for(const entry of owners)entry.backup.dispose();
  profile.free();reset();
 }
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4)throw Error('Supply the shared Wasm runtime and a native physical server fixture');
 console.log(JSON.stringify(await probeContinuedRoomCatalog(process.argv[2],process.argv[3]),null,2));
}
