/** Real opening, native owner, read-scope and retryable cleanup custody. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {RestoredLocalOperationJournal as Journal,restoredLocalJournalBinding as binding} from '../packages/breditor-collaboration/dist/restored_local_operation/journal.js';
import {openRestoredLocalHistory as open} from '../packages/breditor-collaboration/dist/restored_local_operation/open_source.js';
import {RecoveryLease} from '../packages/breditor-collaboration/dist/participant_recovery/lease.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';import {databaseValues} from './fixtures/independent-delivery-recovery/storage.mjs';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());

test('journal opening reserves both actual namespaces before authority reentry',async()=>{
 const f=await restoredLocalFixture(host,capture);let journal,armed=true;const nested=[];
 try{const options={...f.options,checkAuthority(){if(armed){armed=false;nested.push(Journal.begin(f.file,f.options).then(()=>assert.fail('Reentrant journal escaped'),error=>assert.equal(error.code,'restored_local_operation_busy')));}}};journal=await Journal.begin(f.file,options);await Promise.all(nested);assert.equal(nested.length,1);}
 finally{await journal?.close();await f.close();}
});
test('source reservation and factory snapshot precede authority reentry',async()=>{
 const f=await restoredLocalFixture(host,capture);let journal,source,armed=false,provided;const nested=[];
 try{journal=await Journal.begin(f.file,{...f.options,checkAuthority(){if(armed){armed=false;provided.documentHistory.restoreSegmented=()=>{throw Error('Late native factory');};provided.review.actor='late';nested.push(open(f.nativeOptions(),journal).then(()=>assert.fail('Reentrant source escaped'),error=>assert.equal(error.code,'restored_local_operation_in_use')));}}});provided={...f.nativeOptions(),documentHistory:{...f.nativeOptions().documentHistory},review:{...f.nativeOptions().review}};armed=true;source=await open(provided,journal);await Promise.all(nested);assert.equal(nested.length,1);assert.deepEqual(source.exportRecovery(),f.value.live);}
 finally{await source?.discardAndClose();await journal?.close();await f.close();}
});
test('opening cannot move its cleanup into a replaced storage context',async()=>{
 const f=await restoredLocalFixture(host,capture),saved=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),replacement=new IDBFactory();let journal;
 try{await assert.rejects(Journal.begin(f.file,{...f.options,checkAuthority(){Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:replacement});}}),error=>error.code==='restored_local_operation_storage_changed');assert.deepEqual(await replacement.databases(),[]);Object.defineProperty(globalThis,'indexedDB',saved);assert.equal((await indexedDB.databases()).some(row=>row.name===f.options.database),false);journal=await Journal.begin(f.file,f.options);}
 finally{Object.defineProperty(globalThis,'indexedDB',saved);await journal?.close();await f.close();}
});
test('policy loss while an actual source factory awaits frees only the unreturned owner',async()=>{
 const f=await restoredLocalFixture(host,capture);let journal,source,allowed=true,frees=0;
 try{journal=await Journal.begin(f.file,{...f.options,checkAuthority(){if(!allowed)throw Error('Restore grant ended');}});const original=f.nativeOptions(),restore=original.documentHistory.restoreSegmented;
  await assert.rejects(open({...original,documentHistory:{...original.documentHistory,restoreSegmented:async checkpoint=>{const raw=restore(checkpoint),free=raw.free.bind(raw);raw.free=()=>{frees++;free();};await Promise.resolve();allowed=false;return raw;}}},journal));assert.equal(frees,1);assert.deepEqual((await databaseValues(f.options.sourceDatabase)).local_operation_history_heads.values,[]);allowed=true;assert.deepEqual(await journal.progress(),{sequence:'0',current:null,pending:null});source=await open(f.nativeOptions(),journal);assert.deepEqual(source.exportRecovery(),f.value.live);
 }finally{allowed=true;await source?.discardAndClose();await journal?.close();await f.close();}
});
test('read custody bounds synchronous reentry and source close waits for every actual scope',async()=>{
 const f=await restoredLocalFixture(host,capture);let journal,source;const scopes=[];let denied=0;
 try{journal=await Journal.begin(f.file,f.options);source=await open(f.nativeOptions(),journal);const b=binding(journal),authority=()=>{try{scopes.push(b.borrowRead(source,authority));}catch(error){assert.equal(error.code,'restored_local_operation_busy');denied++;}};scopes.push(b.borrowRead(source,authority));assert.equal(scopes.length,8);assert.equal(denied,1);let done=false;const closing=source.close().then(()=>{done=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);for(const scope of scopes)scope.release();await closing;source=undefined;assert.throws(()=>journal.file());}
 finally{for(const scope of scopes)scope.release();await source?.discardAndClose();await journal?.close();await f.close();}
});
test('native mutation during the final fresh read callback refuses a stale capture',async()=>{
 const f=await restoredLocalFixture(host,capture);let journal,source,scope,armed=false,checks=0;
 try{journal=await Journal.begin(f.file,f.options);source=await open(f.nativeOptions(),journal);scope=binding(journal).borrowRead(source,()=>{if(armed&&++checks===3)insertCleanupText(source.core,'Final restored read mutation ');});armed=true;assert.throws(()=>scope.readSource(),error=>error.code==='restored_local_operation_capture_changed');assert.equal(checks,3);armed=false;scope.release();scope=undefined;await source.flush();assert.match(source.exportRecovery().documentCheckpoint,/Final restored read mutation/);}
 finally{armed=false;scope?.release();await source?.discardAndClose();await journal?.close();await f.close();}
});
test('a failed source cleanup retries the same actual journal and lease owners',async()=>{
 const f=await restoredLocalFixture(host,capture),close=RecoveryLease.prototype.close;let journal,source,failOnce=true;
 try{journal=await Journal.begin(f.file,f.options);source=await open(f.nativeOptions(),journal);const before=await databaseValues(f.options.database);RecoveryLease.prototype.close=async function(){if(failOnce){failOnce=false;throw Error('Real journal lease release failed');}return close.call(this);};await assert.rejects(source.close());assert.equal(journal.file(),journal.file());RecoveryLease.prototype.close=close;await source.close();source=undefined;assert.throws(()=>journal.file());assert.deepEqual(await databaseValues(f.options.database),before);journal=await Journal.resume(f.options);source=await open(f.nativeOptions(),journal);assert.deepEqual(source.exportRecovery(),f.value.live);}
 finally{RecoveryLease.prototype.close=close;await source?.discardAndClose();await journal?.close();await f.close();}
});
for(const stage of ['journal','source'])test(`actual ${stage} request-success cancellation preserves readable native work`,async()=>{
 const f=await restoredLocalFixture(host,capture),controller=new AbortController(),put=IDBObjectStore.prototype.put;let journal,source,scope,hits=0;
 try{journal=await Journal.begin(f.file,{...f.options,signal:controller.signal});source=await open(f.nativeOptions(),journal);const before=await databaseValues(f.options.sourceDatabase);
  IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(stage==='journal'&&this.transaction.db.name===f.options.database&&this.name==='restored_local_operation_intent'||stage==='source'&&this.transaction.db.name===f.options.sourceDatabase&&this.name==='local_operation_history_heads')request.addEventListener('success',()=>{hits++;controller.abort();},{once:true});return request;};
  insertCleanupText(source.core,'Readable cancelled restored edit ');await assert.rejects(source.flush());IDBObjectStore.prototype.put=put;assert.equal(hits,1);assert.deepEqual(await databaseValues(f.options.sourceDatabase),before);scope=binding(journal).borrowRead(source,()=>{});assert.match(scope.readSource().documentCheckpoint,/Readable cancelled restored edit/);const snapshot=await scope.readSnapshot();assert.equal(snapshot.record.pending!==null,stage==='source');
 }finally{IDBObjectStore.prototype.put=put;scope?.release();await source?.discardAndClose();await journal?.close();await f.close();}
});
