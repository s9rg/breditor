/** Actual constructor/bridge reentry, not fake ready flags or a replacement
 * source. These global hooks are trusted isolated fixture instrumentation. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';
import*as api from'../packages/breditor-collaboration/dist/index.js';import*as rich from'@breditor/experimental-rich-content';
import{NativeInputJournal}from'../packages/breditor-collaboration/dist/native_input_operation/journal_kernel.js';
import{RestoredLocalOperationJournal as Journal,createRestoredLocalJournalFacade as createFacade}from'../packages/breditor-collaboration/dist/restored_local_operation/journal.js';
import{OperationalIndependentLocalParticipant as OldParent}from'../packages/breditor-collaboration/dist/independent_local_operation/participant.js';import{captureLocalOperationBackup as capture}from'../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import{localParticipantUnitHost}from'./fixtures/independent-local-operation/participant.mjs';import{restoredLocalFixture}from'./fixtures/restored-local-operation/session.mjs';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
test('actual kernel constructor reentry cannot create an early facade',async()=>{
 const f=await restoredLocalFixture(host,capture),freeze=Object.freeze;let journal,armed=true,observed=0;
 try{Object.freeze=function(value){if(armed&&value instanceof NativeInputJournal){armed=false;observed++;assert.throws(()=>createFacade(value),error=>error.code==='restored_local_operation_closed');}return freeze(value);};journal=await Journal.begin(f.file,f.options);assert.equal(observed,1);assert.deepEqual(await journal.progress(),{sequence:'0',current:null,pending:null});}
 finally{Object.freeze=freeze;await journal?.close();await f.close();}
});
test('actual facade constructor claims its kernel once before final freeze reentry',async()=>{
 const f=await restoredLocalFixture(host,capture),freeze=Object.freeze;let journal,kernel,armed=true,observed=0;
 try{Object.freeze=function(value){if(value instanceof NativeInputJournal)kernel=value;if(armed&&value instanceof Journal){armed=false;observed++;assert.ok(kernel);assert.throws(()=>createFacade(kernel),error=>error.code==='restored_local_operation_closed');}return freeze(value);};journal=await Journal.begin(f.file,f.options);assert.equal(observed,1);assert.throws(()=>createFacade(kernel),error=>error.code==='restored_local_operation_closed');}
 finally{Object.freeze=freeze;await journal?.close();await f.close();}
});
