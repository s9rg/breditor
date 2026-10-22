/** Refuse journal corruption before allocation or publication. Framed native
 * cut checks are distinct from outer digest/CAS checks. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {RestoredLocalOperationJournal as Journal,restoredLocalJournalBinding as binding} from '../packages/breditor-collaboration/dist/restored_local_operation/journal.js';
import {openRestoredLocalHistory as open} from '../packages/breditor-collaboration/dist/restored_local_operation/open_source.js';
import {makeIndependentHistoryCut} from '../packages/breditor-collaboration/dist/independent_history/cut.js';
import {operationCutDigest} from '../packages/breditor-collaboration/dist/independent_operation/cut_codec.js';
import {wrapRestoredLocalHead} from '../packages/breditor-collaboration/dist/restored_local_operation/head.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {change,databaseValues,open as openDatabase} from './fixtures/independent-delivery-recovery/storage.mjs';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());

for(const kind of ['larger','wrong-mime'])test(`reject ${kind} incoming replacement before reading its bytes`,async()=>{
 const f=await restoredLocalFixture(host,capture);let journal,source;const read=Blob.prototype.arrayBuffer;let forbidden=0;
 try{journal=await Journal.begin(f.file,f.options);source=await open(f.nativeOptions(),journal);const poison=kind==='larger'?new Blob([f.file,'x'],{type:f.file.type}):new Blob([f.file],{type:'application/x-wrong-local-input'});
  await change(f.options.database,'restored_local_operation_input',store=>store.put(poison,'incoming'));
  Blob.prototype.arrayBuffer=function(){if(this.size===poison.size&&this.type===poison.type){forbidden++;throw Error('Incoming replacement bytes must not be read');}return read.call(this);};
  await assert.rejects(journal.progress(),error=>error.code==='restored_local_operation_input_changed');assert.equal(forbidden,0);
 }finally{Blob.prototype.arrayBuffer=read;await source?.discardAndClose();await journal?.close();await f.close();}
});

for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`a recomputed valid cut cannot roll either restored lane back before input LIVE document=${documentSegmented} review=${reviewSegmented}`,async()=>{
 const f=await restoredLocalFixture(host,capture,{documentSegmented,reviewSegmented});let journal,source;
 try{journal=await Journal.begin(f.file,f.options);source=await open(f.nativeOptions(),journal);const id=binding(journal).borrowRead(source,()=>{});let identity;try{identity=id.identity;}finally{id.release();}
  const original=f.value.f.recovery,native=await makeIndependentHistoryCut(original.documentCheckpoint,original.reviewCheckpoint,original.identity,original.versions),cut={head:wrapRestoredLocalHead(native.head,identity),files:native.files},hash=await operationCutDigest(cut),db=await openDatabase(f.options.database);
  try{await new Promise((resolve,reject)=>{const tx=db.transaction(['restored_local_operation_intent','restored_local_operation_cuts'],'readwrite'),records=tx.objectStore('restored_local_operation_intent'),cuts=tx.objectStore('restored_local_operation_cuts');const request=records.get('state');request.onsuccess=()=>{const row=request.result;records.put({...row,current:hash},'state');cuts.clear();cuts.add(cut,hash);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  await assert.rejects(journal.progress());await source.discardAndClose();source=undefined;await assert.rejects(Journal.resume(f.options));
 }finally{await source?.discardAndClose();await journal?.close();await f.close();}
});

test('missing acknowledged source or retained incoming never becomes a fresh empty editor',async()=>{
 const f=await restoredLocalFixture(host,capture);let journal,source;
 try{journal=await Journal.begin(f.file,f.options);source=await open(f.nativeOptions(),journal);await source.close();source=undefined;
  await change(f.options.sourceDatabase,'local_operation_history_heads',store=>store.clear());journal=await Journal.resume(f.options);await assert.rejects(open(f.nativeOptions(),journal));const values=await databaseValues(f.options.database);assert.equal(values.restored_local_operation_input.values.length,1);await journal.close();
  await change(f.options.database,'restored_local_operation_input',store=>store.clear());await assert.rejects(Journal.resume(f.options));
 }finally{await source?.discardAndClose();await journal?.close();await f.close();}
});
