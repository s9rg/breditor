/** Whole acknowledged components and initial-vs-operational admission are exact. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {databaseValues,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {secondAsset} from './fixtures/review-assets/pixels.mjs';
const runtime=process.env.BREDITOR_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
const broken=['parent-record','old-record','old-original','old-source','upload-row','journal-original','journal-cut','native-head','native-file'];
for(const kind of broken)test('cold local parent refuses missing acknowledged '+kind+' without source/journal writes',async()=>{
 const f=await host.fixture(),names=['add','put','delete','clear'],methods=new Map(names.map(name=>[name,IDBObjectStore.prototype[name]]));let writes=0;
 try{const p=await f.begin(await f.recover());await p.close();
  if(kind==='parent-record')await change(f.options.database,'local_operation_participant',s=>s.clear());else if(kind==='old-record')await change(f.recoveryOptions.database,'independent_attempts',s=>s.clear());else if(kind==='old-original')await change(f.recoveryOptions.database,'independent_originals',s=>s.put(new Blob(['unrelated original']),'participant'));else if(kind==='old-source')await change(f.recoveryOptions.destinations.source,'history_heads',s=>s.clear());else if(kind==='upload-row')await change(f.recoveryOptions.destinations.uploads,'assets',s=>s.clear());else if(kind==='journal-original')await change(f.options.journalDatabase,'local_operation_original',s=>s.put(new Blob(['unrelated original']),'participant'));else if(kind==='journal-cut')await change(f.options.journalDatabase,'local_operation_cuts',s=>s.clear());else if(kind==='native-head')await change(f.options.sourceDatabase,'local_operation_history_heads',s=>s.clear());else{const rows=await databaseValues(f.options.sourceDatabase);await change(f.options.sourceDatabase,'local_operation_history_files',s=>s.delete(rows.local_operation_history_files.keys[0]));}
  const before=[await databaseValues(f.options.journalDatabase),await databaseValues(f.options.sourceDatabase)];for(const[name,method]of methods)IDBObjectStore.prototype[name]=function(...args){if([f.options.journalDatabase,f.options.sourceDatabase].includes(this.transaction.db.name))writes++;return method.apply(this,args);};await assert.rejects(f.resume());assert.equal(writes,0);assert.deepEqual([await databaseValues(f.options.journalDatabase),await databaseValues(f.options.sourceDatabase)],before);
 }finally{for(const[name,method]of methods)IDBObjectStore.prototype[name]=method;await f.close();}
});
for(const phase of ['preparing','prepared'])for(const lane of ['native','uploads'])test('first '+phase+' publication refuses a valid later '+lane+' descendant',async()=>{
 const f=await host.fixture(),put=IDBObjectStore.prototype.put;let writes=0;
 try{const p=await f.begin(await f.recover()),parts=await f.take(p);if(lane==='native'){insertCleanupText(parts.source.session.core,'Later locally authored descendant ');await parts.source.session.flush();}else await parts.uploads.retry(secondAsset);await parts.source.session.close();parts.uploads.close();await change(f.options.database,'local_operation_participant',s=>{const request=s.get('state');request.onsuccess=()=>s.put({...request.result,phase},'state');});const before=await databaseValues(f.options.sourceDatabase);IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name===f.options.sourceDatabase)writes++;return put.apply(this,args);};await assert.rejects(f.resume(),error=>error.code===(lane==='native'?'independent_local_participant_initial_diverged':'independent_local_participant_uploads_diverged'));assert.equal(writes,0);assert.deepEqual(await databaseValues(f.options.sourceDatabase),before);
 }finally{IDBObjectStore.prototype.put=put;await f.close();}
});
for(const kind of ['receipt','status','attempts','epoch'])test('operational upload conservation rejects original '+kind+' rollback',async()=>{
 const f=await host.fixture({archiveOnly:false,uploadedOriginal:true});let foreign;
 try{const p=await f.begin(await f.recover());await p.close();const entries=f.backup.uploadEntries(),before=entries.find(row=>kind==='epoch'?row.status==='cancelled':row.status==='uploaded');assert.ok(before);await change(f.recoveryOptions.destinations.uploads,'assets',s=>{const request=s.get(before.asset);request.onsuccess=()=>{const row=request.result;s.put(kind==='receipt'?{...row,storageRef:'different-storage-reference'}:kind==='status'?{...row,status:'pending',storageRef:null}:kind==='attempts'?{...row,attempts:0}:{...row,epoch:0});};});foreign=await rich.RichAssetStore.openRetained(f.recoveryOptions.destinations.uploads);const archive=await rich.readRichAssetBackup(await foreign.exportBackup());assert.equal(archive.entries().length,2);archive.dispose();await assert.rejects(f.resume(),error=>error.code==='independent_local_participant_uploads_diverged');}finally{foreign?.close();await f.close();}
});
test('overfull parent state refuses before cloning any state row',async()=>{
 const f=await host.fixture(),get=IDBObjectStore.prototype.get;let reads=0;
 try{const p=await f.begin(await f.recover());await p.close();await change(f.options.database,'local_operation_participant',s=>s.add({unexpected:true},'unrelated'));const before=await databaseValues(f.options.database);IDBObjectStore.prototype.get=function(...args){if(this.transaction.db.name===f.options.database&&this.name==='local_operation_participant')reads++;return get.apply(this,args);};await assert.rejects(f.resume(),error=>error.code==='independent_local_participant_record');assert.equal(reads,0);assert.deepEqual(await databaseValues(f.options.database),before);}finally{IDBObjectStore.prototype.get=get;await f.close();}
});
