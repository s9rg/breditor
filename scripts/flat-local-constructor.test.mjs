/** Trusted isolated reentry hooks observe the actual owners; they never issue
 * fake capabilities or replace the native source with a derivative facade. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {NativeInputJournal} from '../packages/breditor-collaboration/dist/native_input_operation/journal_kernel.js';
import {NativeInputParticipantOpening as Opening} from '../packages/breditor-collaboration/dist/native_input_operation/participant_opening.js';
import {NativeInputParticipantUploads as Uploads} from '../packages/breditor-collaboration/dist/native_input_operation/participant_uploads.js';
import {NativeInputParticipantWitness as Witness} from '../packages/breditor-collaboration/dist/native_input_operation/participant_witness.js';
import {FlatLocalOperationJournal as Journal,createFlatLocalJournalFacade as createFacade} from '../packages/breditor-collaboration/dist/flat_local_operation/journal.js';
import {createRestoredLocalJournalFacade as createSnapshotFacade} from '../packages/breditor-collaboration/dist/restored_local_operation/journal.js';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {secondAsset} from './fixtures/review-assets/pixels.mjs';
const open=api.SharedIndependentHistoryPersistentSession.open;let actualSource;
api.SharedIndependentHistoryPersistentSession.open=async function(options){const source=await open.call(this,options);if(options.database.endsWith('-flat-source'))actualSource=source;return source;};
const {OperationalFlatLocalParticipant:Parent}=await import('../packages/breditor-collaboration/dist/flat_local_operation/participant.js');
api.SharedIndependentHistoryPersistentSession.open=open;
const runtime=process.env.BREDITOR_FLAT_LOCAL_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>host?.free());
const options=f=>({...f.options,cohort:{parentDatabase:f.original.value.f.tag+'-flat-parent',uploadsDatabase:f.original.value.f.tag+'-flat-uploads'}});
test('actual flat kernel/facade cannot be exposed early, claimed twice or reinterpreted as snapshot',async()=>{
 const f=await flatLocalFixture(host),freeze=Object.freeze;let journal,kernel,kernels=0,facades=0;
 try{Object.freeze=function(value){if(value instanceof NativeInputJournal){kernel=value;kernels++;assert.throws(()=>createFacade(value));assert.throws(()=>createSnapshotFacade(value));}if(value instanceof Journal){facades++;assert.ok(kernel);assert.throws(()=>createFacade(kernel));assert.throws(()=>value.file());}return freeze(value);};
  journal=await Journal.begin(f.file,f.options);assert.equal(kernels,1);assert.equal(facades,1);assert.throws(()=>createFacade(kernel));assert.throws(()=>createSnapshotFacade(kernel));assert.deepEqual(await journal.progress(),{sequence:'0',current:null,pending:null});
 }finally{Object.freeze=freeze;await journal?.close();await f.close();}
});
test('opening, uploads, final witness and complete parent deny unreturned constructor rights',async()=>{
 const f=await flatLocalFixture(host),freeze=Object.freeze,counts={opening:0,uploads:0,witness:0,parent:0};let parent;
 try{Object.freeze=function(value){if(value instanceof Opening){counts.opening++;assert.throws(()=>value.complete());assert.throws(()=>value.rollback());}if(value instanceof Uploads){counts.uploads++;assert.throws(()=>value.file());assert.throws(()=>value.release());assert.throws(()=>value.close());}if(value instanceof Witness){counts.witness++;assert.throws(()=>value.check());assert.throws(()=>value.release());}if(value instanceof Parent){counts.parent++;assert.throws(()=>value.file());assert.throws(()=>value.readableSource());}return freeze(value);};
  parent=await Parent.begin(f.file,options(f));assert.deepEqual(counts,{opening:1,uploads:1,witness:1,parent:1});assert.deepEqual(parent.readableSource(),f.live);await parent.check();
 }finally{Object.freeze=freeze;await parent?.discardAndClose();await f.close();}
});
for(const lane of['document','review'])test(`handoff wrapper reentry cannot expose owners or hide a final ${lane} mutation`,async()=>{
 const f=await flatLocalFixture(host),freeze=Object.freeze;let parent,parts,foreign,nativeWrappers=0,inputWrappers=0,partWrappers=0,mutated=false;
 try{const selected=options(f);parent=await Parent.begin(f.file,selected);assert.ok(actualSource);foreign=await rich.RichAssetStore.openRetained(selected.cohort.uploadsDatabase);
  Object.freeze=function(value){if(value&&typeof value==='object'){
   if(Object.getOwnPropertyDescriptor(value,'session')?.get){nativeWrappers++;assert.throws(()=>value.session);}
   if(Object.keys(value).sort().join(',')==='blob,file'&&typeof value.file==='function'){inputWrappers++;assert.throws(()=>value.file());}
   if(Object.getOwnPropertyDescriptor(value,'uploads')?.get){partWrappers++;assert.throws(()=>value.source);assert.throws(()=>value.uploads);assert.throws(()=>value.input);if(!mutated){mutated=true;if(lane==='document')insertCleanupText(actualSource.core,'Final wrapper mutation ');else actualSource.core.dispatchReview({kind:'create_thread',data:{anchorJson:actualSource.core.captureReviewAnchor({kind:'document'}),body:'Final wrapper review mutation'}});}}
  }return freeze(value);};
  await assert.rejects(parent.intoParts(),error=>error.code==='flat_local_input_handoff_changed');Object.freeze=freeze;assert.equal(mutated,true);assert.equal(nativeWrappers,1);assert.equal(inputWrappers,1);assert.equal(partWrappers,1);await assert.rejects(foreign.cancel(secondAsset),error=>error.code==='asset_custody_busy');await actualSource.flush();await parent.check();parts=await parent.intoParts();await parts.uploads.cancel(secondAsset);assert.notDeepEqual(parts.source.session.exportRecovery(),f.live);
 }finally{Object.freeze=freeze;await parts?.source.session.discardAndClose();parts?.uploads.close();foreign?.close();await parent?.discardAndClose();await f.close();}
});
