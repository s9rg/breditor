/** Prepared/native/operational failures retain genuine old or cold ownership. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {IDBObjectStore} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {recoveryFaults,databaseValues} from './fixtures/independent-delivery-recovery/storage.mjs';
import {pixel} from './fixtures/review-assets/pixels.mjs';
const runtime=process.env.BREDITOR_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname,bytes=async file=>Buffer.from(await file.arrayBuffer());let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
const windows=[['prepared-abort','parent',1,'abort'],['prepared-lost-ack','parent',1,'lost-ack'],['prepare-abort','journal',1,'abort'],['prepare-lost-ack','journal',1,'lost-ack'],['source-abort','source',1,'abort'],['source-lost-ack','source',1,'lost-ack'],['ack-abort','journal',2,'abort'],['ack-lost-ack','journal',2,'lost-ack'],['operational-abort','parent',2,'abort'],['operational-lost-ack','parent',2,'lost-ack']];
for(const[label,lane,number,kind]of windows)test('complete local ownership resumes after '+label,async()=>{
 const f=await host.fixture(),faults=recoveryFaults();
 try{const ready=await f.recover(),database=lane==='parent'?f.options.database:lane==='journal'?f.options.journalDatabase:f.options.sourceDatabase,store=lane==='parent'?'local_operation_participant':lane==='journal'?'local_operation_intent':'local_operation_history_heads';faults.select(database,store,number,kind);await assert.rejects(f.begin(ready));assert.equal(faults.observed.length>=number,true);faults.clear();let p;
  if(label.startsWith('prepared-')){assert.deepEqual(await bytes(ready.file()),await bytes(f.file));p=await f.begin(ready,'resumeRecovered');}else{await assert.rejects(ready.intoParts());p=await f.resume();}
  assert.deepEqual(p.readableSource(),f.recovery);await p.check();const parts=await f.take(p);assert.deepEqual(await bytes(await parts.uploads.exportBackup()),f.uploadBytes);assert.deepEqual(await bytes(parts.original.blob(f.reference.asset,f.reference.generation)),pixel);
 }finally{faults.restore();await f.close();}
});
for(const phase of ['initial','prepared','operational'])test('actual parent '+phase+' request-success cancellation aborts its publication',async()=>{
 const f=await host.fixture(),controller=new AbortController(),add=IDBObjectStore.prototype.add,put=IDBObjectStore.prototype.put;let hits=0,seen=0;
 try{const ready=await f.recover();for(const[name,original]of [['add',add],['put',put]])IDBObjectStore.prototype[name]=function(...args){const request=original.apply(this,args);if(this.transaction.db.name===f.options.database&&this.name==='local_operation_participant'&&(phase==='initial'?name==='add':name==='put'&&++seen===(phase==='prepared'?1:2)))request.addEventListener('success',()=>{hits++;controller.abort();},{once:true});return request;};await assert.rejects(f.begin(ready,'begin',{recovery:{...f.options.recovery,signal:controller.signal}}));IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;assert.equal(hits,1);
  if(phase==='initial'){assert.equal((await indexedDB.databases()).some(row=>row.name===f.options.database),false);const p=await f.begin(ready);await f.take(p);}else{const state=(await databaseValues(f.options.database)).local_operation_participant.values[0];assert.equal(state.phase,phase==='prepared'?'preparing':'prepared');const p=phase==='prepared'?await f.begin(ready,'resumeRecovered'):await f.resume();assert.deepEqual(p.readableSource(),f.recovery);await f.take(p);}
 }finally{IDBObjectStore.prototype.add=add;IDBObjectStore.prototype.put=put;await f.close();}
});
