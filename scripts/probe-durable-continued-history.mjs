/** Actual native SDK storage migration under controlled IndexedDB and Web Locks. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {IDBDatabase,IDBFactory,IDBObjectStore} from 'fake-indexeddb';

const [sdkPath,wasmPath,binaryPath,fixturePath]=process.argv.slice(2);
assert.equal(process.argv.length,6);
const load=path=>import(pathToFileURL(resolve(path)).href);
const {SharedSegmentedPersistentSession:Session}=await load(sdkPath),runtime=await load(wasmPath);
const {captureContinuedPersistentRecords}=await load(join(dirname(sdkPath),'persistence/segmented_session.js'));
await runtime.default({module_or_path:readFileSync(binaryPath)});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
 ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(readFileSync(fixturePath,'utf8')));
const held=new Set();
Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});
Object.defineProperty(globalThis,'navigator',{value:{locks:{
 request(name,options,callback){
  assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});
  return Promise.resolve().then(async()=>{
   if(held.has(name))return callback(null);
   held.add(name);
   try{return await callback({name});}finally{held.delete(name);}
  });
 },
}},configurable:true});
const profile=runtime.SharedRichProfile.from_configuration_json(JSON.stringify({
 format:'breditor/shared-rich-profile',formatVersion:1,
 schema:{name:'example/durable-continued-history',version:1},extensions:[],
}));
const {schema,schemaFingerprint}=JSON.parse(profile.descriptor_json());
const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema,schemaFingerprint,root});
const options={database:'continued-history',room:'room',writer:'101',richLanguage:1,history:'explicit',
 rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null,readOnly:false,
 review:{actor:'review-101',principal:'alice',access:'comment'},profile};
const legacy={...options,initialGenerations:{root:'root',active:'v1-active'},
 create:()=>profile.create(document,'101'),restoreSegmented:checkpoint=>profile.restore_segmented('room',checkpoint)};
const key=['room','101'];
const insert=(session,text)=>session.core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
async function rows(database=options.database){
 const db=await new Promise((resolve,reject)=>{
  const open=indexedDB.open(database);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
 });
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(['generation_files','generation_heads'],'readonly');
  const files=tx.objectStore('generation_files').getAll(),heads=tx.objectStore('generation_heads');
  const active=heads.get(key),prior=heads.get([...key,'continued-from']);
  tx.oncomplete=()=>resolve({files:files.result,active:active.result,prior:prior.result});
  tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}

let session;
const add=IDBObjectStore.prototype.add,transaction=IDBDatabase.prototype.transaction;
const lockCheck=()=>assert.equal(held.size,0);
async function changeHead(recordKey,head){
 const db=await new Promise((resolve,reject)=>{
  const open=indexedDB.open(options.database);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
 });
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('generation_heads','readwrite');
  tx.objectStore('generation_heads').put(head,recordKey);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
try{
 await assert.rejects(Session.openContinued({...options,database:'missing'}),/existing generation store/);
 assert.equal((await indexedDB.databases()).length,0);
 session=await Session.open(legacy);
 assert.equal(insert(session,'pre-migration offline work '),true);
 const anchor=session.core.captureReviewAnchor({kind:'document'});
 assert.equal(session.core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Retained comment'}}).kind,'committed');
 const version=session.saveVersion('Retained version','1792450000000');
 await session.sealGeneration('v1-tail');
 assert.equal(insert(session,'retained redo '),true);
 assert.equal(session.core.undo(),true);
 assert.equal(session.core.undoReview().kind,'committed');
 const expected=session.exportRecovery(),acknowledged=session.core.writerClockV2('101');
 const commentClock=session.core.localReviewClock();
 const request={...options,expected,nextGeneration:'v2-active'};
 await assert.rejects(Session.continueHistory(request),error=>error.code==='writer_in_use');
 await session.close();session=undefined;lockCheck();
 const before=await rows();
 assert.equal(before.prior,undefined);
 await assert.rejects(Session.openContinued(options));
 await assert.rejects(Session.continueHistory({...request,expected:{...expected,versions:[]}}),/stale/);
 assert.deepEqual(await rows(),before);
 let aborted=0;
 IDBObjectStore.prototype.add=function(value,recordKey){
  const result=add.call(this,value,recordKey);
  if(this.transaction.db.name===options.database&&this.name==='generation_heads'&&recordKey?.at(-1)==='continued-from'){
   aborted++;this.transaction.abort();
  }
  return result;
 };
 try{await assert.rejects(Session.continueHistory(request));}
 finally{IDBObjectStore.prototype.add=add;}
 assert.equal(aborted,1);lockCheck();
 assert.deepEqual(await rows(),before);

 let lost=0;
 IDBDatabase.prototype.transaction=function(...args){
  const tx=transaction.apply(this,args);
  if(this.name===options.database&&args[1]==='readwrite'&&args[2]?.durability==='strict'){
   tx.addEventListener('complete',()=>{lost++;this.onversionchange?.(new Event('versionchange'));},{once:true});
  }
  return tx;
 };
 try{await assert.rejects(Session.continueHistory(request),error=>error.code==='session_open_versionchange');}
 finally{IDBDatabase.prototype.transaction=transaction;}
 assert.equal(lost,1);lockCheck();
 const committed=await rows();
 assert.equal(committed.prior,before.active);
 for(const file of before.files)assert.ok(committed.files.includes(file));
 assert.equal(JSON.parse(committed.active).formatVersion,2);
 await assert.rejects(Session.open(legacy));
 await assert.rejects(Session.continueHistory({...request,nextGeneration:'foreign'}),/already advanced or differs/);
 assert.deepEqual(await rows(),committed);
 session=await Session.continueHistory(request);
 assert.equal(session.core.segmentedHistoryPolicy(),'continued-v2');
 assert.deepEqual(session.core.writerClockV2('101'),acknowledged);
 assert.deepEqual(session.core.localReviewClock(),commentClock);
 assert.equal(session.versionPacket(version.id),expected.versions[0]);
 assert.equal(session.exportContinuedRecovery().reviewCheckpoint,expected.reviewCheckpoint);
 assert.throws(()=>session.exportRecovery());
 assert.deepEqual(await rows(),committed);
 const converted=session.exportContinuedRecovery();
 const documentV1=JSON.parse(expected.checkpoint),documentV2=JSON.parse(converted.checkpoint);
 assert.equal(documentV2.rootCheckpoint,documentV1.rootCheckpoint);
 assert.deepEqual(documentV2.sealed,[...documentV1.sealed,documentV1.active]);
 await session.close();session=undefined;
 session=await Session.openContinued(options);
 assert.deepEqual(session.exportContinuedRecovery(),converted);
 assert.equal(session.core.redo(),true);
 assert.equal(session.core.redoReview().kind,'committed');
 assert.equal(insert(session,'new offline group '),true);
 await session.sealGeneration('v2-next');
 const current=session.exportContinuedRecovery(),offline=session.core.writerGroupsV2(acknowledged.through);
 const unsettled=session.exportContinuedBackup();
 session.save();
 await assert.rejects(unsettled,/settled, unchanged/);
 await session.flush();
 assert.ok(offline.groups.length>=2);
 let deniedWrites=0;
 IDBDatabase.prototype.transaction=function(...args){
  const tx=transaction.apply(this,args);
  if(this.name===options.database&&args[1]==='readwrite'&&args[0].includes('generation_heads')){
   deniedWrites++;
   queueMicrotask(()=>tx.abort());
  }
  return tx;
 };
 const retainedBeforeFault=await rows();
 try{
  assert.equal(insert(session,'failed generation save'),true);
  await assert.rejects(session.flush());
  assert.equal(insert(session,'still pending after failed save'),true);
  await assert.rejects(session.flush());
 }finally{IDBDatabase.prototype.transaction=transaction;}
 assert.equal(deniedWrites,2);
 const observed=await captureContinuedPersistentRecords(session,()=>{});
 try{
  const data=observed.metadata();
  assert.equal(data.formatVersion,2);
  assert.equal(data.committed.head,retainedBeforeFault.active);
  assert.equal(data.predecessor.head,retainedBeforeFault.prior);
  assert.equal(data.predecessor.checkpoint,expected.checkpoint);
  assert.deepEqual(data.predecessor.record.versions,expected.versions);
  assert.match(data.attempt.capture.checkpoint,/failed generation save/);
  assert.doesNotMatch(data.attempt.capture.checkpoint,/still pending after failed save/);
  assert.match(data.pending.checkpoint,/still pending after failed save/);
  assert.deepEqual(data.live,data.pending);
  assert.ok(Object.isFrozen(data.predecessor.record.versions));
  await observed.verify();
  const changed=JSON.parse(retainedBeforeFault.prior);
  changed.versions=[];
  await changeHead([...key,'continued-from'],JSON.stringify(changed));
  await assert.rejects(observed.verify(),error=>error.code==='generation_record_read_record');
  assert.equal((await rows()).prior,JSON.stringify(changed));
  await changeHead([...key,'continued-from'],retainedBeforeFault.prior);
  await observed.verify();
 }finally{observed.dispose();}
 assert.deepEqual(await rows(),retainedBeforeFault);
 await session.discardAndClose();session=undefined;
 await assert.rejects(Session.continueHistory(request),/already advanced or differs/);
 session=await Session.openContinued({...options,readOnly:true,review:{...options.review,access:'read_only'}});
 assert.deepEqual(session.exportContinuedRecovery(),current);
 assert.deepEqual(session.core.writerGroupsV2(acknowledged.through),offline);
 assert.throws(()=>insert(session,'forbidden'));
 assert.equal((await rows()).prior,before.active);
 const read=IDBObjectStore.prototype.getAll,observedHeads=[];
 IDBObjectStore.prototype.getAll=function(recordKey,count){
  if(this.transaction.db.name===options.database&&this.name==='generation_heads'){
   observedHeads.push({key:recordKey,count,transaction:this.transaction});
  }
  return read.call(this,recordKey,count);
 };
 let backup;
 try{backup=await session.exportContinuedBackup();}
 finally{IDBObjectStore.prototype.getAll=read;}
 assert.deepEqual(observedHeads.map(row=>[row.key,row.count]),[[key,1],[[...key,'continued-from'],1]]);
 assert.equal(observedHeads[0].transaction,observedHeads[1].transaction);
 assert.equal(observedHeads[0].transaction.mode,'readonly');
 assert.deepEqual(backup.current,current);
 assert.deepEqual(backup.predecessor,expected);
 assert.equal(Object.isFrozen(backup),true);
 assert.equal(Object.isFrozen(backup.current.versions),true);
 const restore={...options,database:'restored-history',backup,writerRecovery:'host-reacquired'};
 await assert.rejects(Session.restoreContinuedRecovery(restore),error=>error.code==='writer_in_use');
 await session.close();session=undefined;lockCheck();
 await assert.rejects(Session.restoreContinuedRecovery({...restore,writerRecovery:undefined}),error=>error.code==='backup_writer_recovery');
 await assert.rejects(Session.restoreContinuedRecovery({...restore,backup:{...backup,current:{...backup.current,versions:[]}}}),/exact V1 packets/);
 await assert.rejects(Session.restoreContinuedRecovery({...restore,backup:{...backup,predecessor:{...expected,checkpoint:current.checkpoint}}}));
 // A valid current comment checkpoint from a different same-actor branch is
 // insufficient even when the entire document and every version byte match.
 const fork=await Session.open({...legacy,database:'foreign-review'});
 let forkReview;
 try{
  const anchor=fork.core.captureReviewAnchor({kind:'document'});
  assert.equal(fork.core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Unrelated discussion'}}).kind,'committed');
  forkReview=fork.exportRecovery().reviewCheckpoint;
 }finally{await fork.close();}
 await assert.rejects(Session.restoreContinuedRecovery({...restore,backup:{...backup,current:{...backup.current,reviewCheckpoint:forkReview}}}));
 const badHead=JSON.parse(retainedBeforeFault.active);
 badHead.review.checkpoint=forkReview;
 const foreignReviewHead=JSON.stringify(badHead);
 await changeHead(key,foreignReviewHead);
 try{
  await assert.rejects(Session.openContinued(options),/review recovery origin event differs/);
  lockCheck();
  assert.deepEqual(await rows(),{...retainedBeforeFault,active:foreignReviewHead});
 }finally{await changeHead(key,retainedBeforeFault.active);}
 const missingVersionsHead=JSON.stringify({...JSON.parse(retainedBeforeFault.active),versions:[]});
 await changeHead(key,missingVersionsHead);
 try{
  await assert.rejects(Session.openContinued(options),/exact V1 packets/);
  lockCheck();
  assert.deepEqual(await rows(),{...retainedBeforeFault,active:missingVersionsHead});
 }finally{await changeHead(key,retainedBeforeFault.active);}
 session=await Session.openContinued(options);
 assert.deepEqual(await session.exportContinuedBackup(),backup);
 await session.close();session=undefined;lockCheck();
 const exists=async name=>(await indexedDB.databases()).some(db=>db.name===name);
 assert.equal(await exists(restore.database),false);
 let abortedRestore=0;
 IDBObjectStore.prototype.add=function(value,recordKey){
  const result=add.call(this,value,recordKey);
  if(this.transaction.db.name===restore.database&&this.name==='generation_heads'&&recordKey?.at(-1)==='continued-from'){
   abortedRestore++;this.transaction.abort();
  }
  return result;
 };
 try{await assert.rejects(Session.restoreContinuedRecovery(restore));}
 finally{IDBObjectStore.prototype.add=add;}
 assert.equal(abortedRestore,1);
 assert.equal(await exists(restore.database),false);
 lockCheck();
 const factory=indexedDB,open=factory.open;
 let unacknowledgedRestore=0;
 factory.open=function(name,...args){
  const request=open.call(this,name,...args);
  if(name===restore.database)request.addEventListener('success',()=>{
   unacknowledgedRestore++;
   Object.defineProperty(globalThis,'indexedDB',{value:new IDBFactory(),configurable:true});
  },{once:true});
  return request;
 };
 try{await assert.rejects(Session.restoreContinuedRecovery(restore),/storage context changed/);}
 finally{factory.open=open;Object.defineProperty(globalThis,'indexedDB',{value:factory,configurable:true});}
 assert.equal(unacknowledgedRestore,1);
 lockCheck();
 assert.equal(await exists(restore.database),true);
 await assert.rejects(Session.restoreContinuedRecovery(restore),error=>error.code==='continued_history_destination_exists');
 session=await Session.openContinued({...options,database:restore.database});
 assert.deepEqual(await session.exportContinuedBackup(),backup);
 assert.deepEqual(await rows(restore.database),await rows());
 assert.deepEqual(session.core.writerGroupsV2(acknowledged.through),offline);
 assert.equal(session.versionPacket(version.id),expected.versions[0]);
 await session.close();session=undefined;
 await assert.rejects(Session.restoreContinuedRecovery(restore),error=>error.code==='continued_history_destination_exists');
 await assert.rejects(Session.restoreContinuedRecovery({...restore,database:options.database}),error=>error.code==='continued_history_destination_exists');
 session=await Session.openContinued({...options,database:restore.database});
 assert.deepEqual(await session.exportContinuedBackup(),backup);
 assert.equal(session.core.undo(),true);
 assert.equal(session.core.redo(),true);
 assert.equal(session.core.undoReview().kind,'committed');
 assert.equal(session.core.redoReview().kind,'committed');
 await session.flush();
 const after=await session.exportContinuedBackup();
 assert.deepEqual(after.predecessor,expected);
 assert.notEqual(after.current.checkpoint,backup.current.checkpoint);
 await session.close();session=undefined;lockCheck();
 const documentOnly={...options,database:'document-only',review:undefined};
 session=await Session.open({...legacy,...documentOnly});
 assert.equal(insert(session,'Document-only offline edit '),true);
 const originalDocumentOnly=session.exportRecovery();
 await session.close();session=undefined;
 session=await Session.continueHistory({...documentOnly,expected:originalDocumentOnly,nextGeneration:'continued-document-only'});
 const documentOnlyBackup=await session.exportContinuedBackup();
 assert.equal(documentOnlyBackup.current.reviewCheckpoint,null);
 assert.equal(documentOnlyBackup.predecessor.reviewCheckpoint,null);
 await session.close();session=undefined;
 session=await Session.restoreContinuedRecovery({...documentOnly,database:'restored-document-only',
  backup:documentOnlyBackup,writerRecovery:'host-reacquired',readOnly:true});
 assert.deepEqual(await session.exportContinuedBackup(),documentOnlyBackup);
 assert.throws(()=>insert(session,'Read-only restore'));
 await session.close();session=undefined;lockCheck();
 console.log(JSON.stringify({passed:true,abortedMigration:aborted,lostAcknowledgement:lost,
  exactV1Predecessor:true,documentAndCommentRedo:true,versionsPreserved:true,offlineGroups:offline.groups.length,
  abortedRestore,unacknowledgedRestore,backupRestored:true,documentOnlyRestore:true,atomicPredecessorRead:true,continuedFourSlotRead:true,foreignReviewRefused:true,coldForeignReviewRefused:true,coldMissingVersionPrefixRefused:true,existingDestinationRefused:true}));
}finally{
 IDBObjectStore.prototype.add=add;
 IDBDatabase.prototype.transaction=transaction;
 await session?.discardAndClose();
 profile.free();
}
