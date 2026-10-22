/** Shared machinery cannot widen closed formats or issue structural custody. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';
import*as api from'../packages/breditor-collaboration/dist/index.js';import*as rich from'@breditor/experimental-rich-content';
import{NativeInputJournal,nativeInputJournalBinding}from'../packages/breditor-collaboration/dist/native_input_operation/journal_kernel.js';
import*as registry from'../packages/breditor-collaboration/dist/native_input_operation/journal_families.js';
import{RestoredLocalOperationJournal as Journal,createRestoredLocalJournalFacade as createFacade,restoredLocalJournalBinding as binding}from'../packages/breditor-collaboration/dist/restored_local_operation/journal.js';
import{OperationalIndependentLocalParticipant as OldParent}from'../packages/breditor-collaboration/dist/independent_local_operation/participant.js';import{captureLocalOperationBackup as capture}from'../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import{localParticipantUnitHost}from'./fixtures/independent-local-operation/participant.mjs';import{restoredLocalFixture}from'./fixtures/restored-local-operation/session.mjs';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
test('families are intrinsic private identities, never caller adapters or prototype-only copies',async()=>{
 let calls=0;const fake={kind:'snapshot-v1',get intrinsics(){calls++;return{};},snapshot(){calls++;return{};}};
 for(const value of[fake,Object.create(Object.getPrototypeOf(registry.restoredLocalJournalFamily)),{}]){assert.throws(()=>registry.nativeInputJournalFamily(value),error=>error.code==='native_input_operation_family');await assert.rejects(NativeInputJournal.open(value,{checkAuthority(){calls++;}}));}
 assert.equal(calls,0);assert.throws(()=>new registry.NativeInputJournalFamily({},{}));assert.equal('register' in registry,false);for(const name of['NativeInputJournal','NativeInputJournalFamily','createRestoredLocalJournalFacade'])assert.equal(name in api,false);
 const actual=registry.nativeInputJournalFamily(registry.restoredLocalJournalFamily);for(const value of[actual,actual.input,actual.head,actual.database])assert.equal(Object.isFrozen(value),true);assert.equal(actual.kind,'snapshot-v1');
});
test('constructor bridges cannot wrap structural kernels or already wrapped journals',async()=>{
 for(const fake of[{},Object.create(NativeInputJournal.prototype),{family:registry.restoredLocalJournalFamily,ready:true}])assert.throws(()=>createFacade(fake),error=>error.code==='restored_local_operation_closed');
 const f=await restoredLocalFixture(host,capture);let journal;try{journal=await Journal.begin(f.file,f.options);assert.throws(()=>createFacade(journal),error=>error.code==='restored_local_operation_closed');assert.throws(()=>nativeInputJournalBinding({},journal));assert.throws(()=>binding(Object.create(Journal.prototype)),error=>error.code==='restored_local_operation_closed');}finally{await journal?.close();await f.close();}
});
test('unreturned facade has no reads, cleanup or source binding during actual driver construction',async()=>{
 const f=await restoredLocalFixture(host,capture),freeze=Object.freeze;let journal,facade,armed=true,observed=0;
 try{Object.freeze=function(value){if(value instanceof Journal)facade=value;if(armed&&value?.storage==='local-operation-v1'&&value.operation===facade){armed=false;observed++;assert.throws(()=>binding(facade),error=>error.code==='restored_local_operation_closed');assert.throws(()=>facade.file(),error=>error.code==='restored_local_operation_closed');assert.throws(()=>facade.close(),error=>error.code==='restored_local_operation_closed');}return freeze(value);};journal=await Journal.begin(f.file,f.options);assert.equal(observed,1);assert.equal(journal,facade);assert.ok(binding(journal).driver);assert.deepEqual(Buffer.from(await journal.file().arrayBuffer()),Buffer.from(await f.file.arrayBuffer()));}
 finally{Object.freeze=freeze;await journal?.close();await f.close();}
});
test('shared opener always runs the fixed family policy and cannot reinterpret graph-shaped input',async()=>{
 const f=await restoredLocalFixture(host,capture);let calls=0;try{await assert.rejects(NativeInputJournal.open(registry.restoredLocalJournalFamily,{...f.options,kind:'flat-graph-v1',checkAuthority(){calls++;}},f.file));assert.equal(calls,0);assert.equal((await indexedDB.databases()).some(row=>row.name===f.options.database),false);}finally{await f.close();}
});
