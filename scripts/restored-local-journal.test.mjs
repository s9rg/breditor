/** Genuine restored-local publication and future native histories. Synthetic
 * transaction interruptions are not physical crash-durability qualification. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {localOperationJournalBinding} from '../packages/breditor-collaboration/dist/independent_local_operation/cut_journal.js';
import {RestoredLocalOperationJournal as Journal,restoredLocalJournalBinding as binding} from '../packages/breditor-collaboration/dist/restored_local_operation/journal.js';
import {openRestoredLocalHistory as open} from '../packages/breditor-collaboration/dist/restored_local_operation/open_source.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {portableBytes as bytes} from './fixtures/independent-local-operation/portable.mjs';
import {pixel} from './fixtures/review-assets/pixels.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {recoveryFaults,databaseValues} from './fixtures/independent-delivery-recovery/storage.mjs';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());

test('new restored owner is private and does not admit serialized ownership',async()=>{
 for(const name of ['RestoredLocalOperationJournal','DetachedRestoredLocalInput','openRestoredLocalHistory','restoredLocalJournalBinding'])assert.equal(name in api,false);
 assert.throws(()=>Reflect.construct(Journal,[]));assert.throws(()=>binding({ready:true}));
 const f=await restoredLocalFixture(host,capture);try{const before=await indexedDB.databases();await assert.rejects(open(f.nativeOptions(),{ready:true}));assert.deepEqual(await indexedDB.databases(),before);}finally{await f.close();}
});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])test(`publish LIVE once and preserve both native futures through cold resume document=${documentSegmented} review=${reviewSegmented}`,async()=>{
 const f=await restoredLocalFixture(host,capture,{documentSegmented,reviewSegmented}),faults=recoveryFaults();let journal,source,reference;
 try{
  journal=await Journal.begin(f.file,f.options);assert.deepEqual(await journal.progress(),{sequence:'0',current:null,pending:null});
  const before=await bytes(journal.file()),requested=[],request=navigator.locks.request;navigator.locks.request=function(name,...args){requested.push(name);return request.call(this,name,...args);};
  faults.select(f.options.sourceDatabase,'local_operation_history_heads',10000);
  try{source=await open(f.nativeOptions(),journal);}finally{navigator.locks.request=request;}
  assert.equal(faults.observed.length,1);assert.equal(requested.filter(name=>name.startsWith('breditor:shared-writer:')).length,1);assert.equal(requested.filter(name=>name.startsWith('breditor:review-writer:')).length,1);
  assert.deepEqual(source.exportRecovery(),f.value.live);assert.deepEqual(await bytes(journal.file()),before);assert.deepEqual(await bytes(journal.blob(f.value.f.reference.asset,f.value.f.reference.generation)),pixel);
  const progress=await journal.progress();assert.equal(progress.sequence,'2');assert.equal(progress.pending,null);assert.ok(progress.current);
  assert.throws(()=>journal.close(),error=>error.code==='restored_local_operation_in_use');assert.throws(()=>localOperationJournalBinding(journal));
  assert.throws(()=>api.captureSharedIndependentSource({session:source}));assert.throws(()=>api.captureSharedIndependentDeliverySource({session:source}));
  const actual=[];for(const method of ['undo','redo','undo']){assert.equal(source.core[method](),true);assert.equal(source.core[method==='undo'?'undoReview':'redoReview']().kind,'committed');actual.push(source.exportRecovery());}await source.flush();const saved=source.exportRecovery();await source.close();source=undefined;
  assert.throws(()=>journal.file());journal=await Journal.resume(f.options);source=await open(f.nativeOptions(),journal);assert.deepEqual(source.exportRecovery(),saved);assert.deepEqual(await bytes(journal.file()),before);await source.close();source=undefined;
  reference=await api.SharedIndependentHistoryPersistentSession.restoreRecovery({...f.nativeOptions(),database:f.value.f.tag+'-reference'},f.value.live,'host-reacquired');
  for(const [index,method]of ['undo','redo','undo'].entries()){assert.equal(reference.core[method](),true);assert.equal(reference.core[method==='undo'?'undoReview':'redoReview']().kind,'committed');assert.deepEqual(reference.exportRecovery(),actual[index]);}
 }finally{faults.clear();faults.restore();await reference?.discardAndClose();await source?.discardAndClose();await journal?.close();await f.close();}
});

for(const boundary of [
 {name:'prepare abort',store:'restored_local_operation_intent',number:1,kind:'abort',sequence:'0'},
 {name:'prepare committed but completion lost',store:'restored_local_operation_intent',number:1,kind:'lost-ack',sequence:'1'},
 {name:'native save abort',source:true,store:'local_operation_history_heads',number:1,kind:'abort',sequence:'1'},
 {name:'native committed but completion lost',source:true,store:'local_operation_history_heads',number:1,kind:'lost-ack',sequence:'1'},
 {name:'acknowledgement abort',store:'restored_local_operation_intent',number:2,kind:'abort',sequence:'1'},
 {name:'acknowledgement committed but completion lost',store:'restored_local_operation_intent',number:2,kind:'lost-ack',sequence:'2'},
])test(`cold restore resumes exact input after ${boundary.name}`,async()=>{
 const f=await restoredLocalFixture(host,capture),faults=recoveryFaults();let journal,source;
 try{journal=await Journal.begin(f.file,f.options);faults.select(boundary.source?f.options.sourceDatabase:f.options.database,boundary.store,boundary.number,boundary.kind);await assert.rejects(open(f.nativeOptions(),journal));faults.clear();assert.equal((await journal.progress()).sequence,boundary.sequence);await journal.close();journal=await Journal.resume(f.options);source=await open(f.nativeOptions(),journal);assert.deepEqual(source.exportRecovery(),f.value.live);assert.equal((await journal.progress()).sequence,'2');const rows=await databaseValues(f.options.database);assert.equal(rows.restored_local_operation_input.values.length,1);assert.deepEqual(await bytes(rows.restored_local_operation_input.values[0]),await bytes(f.file));}
 finally{faults.clear();faults.restore();await source?.discardAndClose();await journal?.close();await f.close();}
});

test('fresh read custody survives ended write policy and owns incoming uploads without enqueueing them',async()=>{
 const f=await restoredLocalFixture(host,capture);let allowed=true,journal,source,scope;const abort=new AbortController();
 try{journal=await Journal.begin(f.file,{...f.options,signal:abort.signal,checkAuthority(){if(!allowed)throw Error('Write ended');}});source=await open(f.nativeOptions(),journal);insertCleanupText(source.core,'Unsaved restored work ');await source.flush();const expected=source.exportRecovery();allowed=false;abort.abort();assert.throws(()=>source.save());scope=binding(journal).borrowRead(source,()=>{});assert.deepEqual(scope.readSource(),expected);assert.deepEqual(await bytes(scope.uploads()),f.value.uploads);const snapshot=await scope.readSnapshot();assert.equal(snapshot.record.pending,null);assert.equal(snapshot.record.sequence,'4');assert.deepEqual(await bytes(snapshot.input),await bytes(f.file));scope.release();scope=undefined;
  for(let index=0;index<10;index++)assert.throws(()=>binding(journal).borrowRead(source,()=>{throw Error('Read denied');}));scope=binding(journal).borrowRead(source,()=>{});assert.deepEqual(scope.readSource(),expected);
 }finally{scope?.release();await source?.discardAndClose();await journal?.close();await f.close();}
});
