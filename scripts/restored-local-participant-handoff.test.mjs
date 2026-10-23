/** Development regression: returned wrapper construction must precede genuine
 * upload/native custody consumption. An interrupted handoff remains retryable. */
import test,{before,after}from'node:test';import assert from'node:assert/strict';
import*as api from'../packages/breditor-collaboration/dist/index.js';import*as rich from'@breditor/experimental-rich-content';
import{OperationalIndependentLocalParticipant as OldParent}from'../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import{OperationalRestoredLocalParticipant as Parent}from'../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import{captureLocalOperationBackup as capture}from'../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import{localParticipantUnitHost}from'./fixtures/independent-local-operation/participant.mjs';import{restoredLocalFixture}from'./fixtures/restored-local-operation/session.mjs';
import{pixel,secondAsset}from'./fixtures/review-assets/pixels.mjs';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let host;before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
const bytes=async file=>Buffer.from(await file.arrayBuffer());
for(const boundary of['session','input','parts'])test(`snapshot ${boundary} wrapper interruption keeps the actual parent and uploads retryable`,async()=>{
 const f=await restoredLocalFixture(host,capture),freeze=Object.freeze,failure=new Error('Injected returned-wrapper construction interruption');let parent,parts,foreign,hit=0;
 try{
  const o={...f.options,cohort:{parentDatabase:f.value.f.tag+'-construction-parent',uploadsDatabase:f.value.f.tag+'-construction-uploads'}};
  parent=await Parent.begin(f.file,o);foreign=await rich.RichAssetStore.openRetained(o.cohort.uploadsDatabase);const baseline=parent.readableSource();
  Object.freeze=function(value){const match=value&&typeof value==='object'&&(boundary==='session'?Object.hasOwn(value,'session')&&Object.keys(value).length===1:boundary==='input'?Object.hasOwn(value,'file')&&Object.hasOwn(value,'blob')&&Object.keys(value).length===2:Object.hasOwn(value,'source')&&Object.hasOwn(value,'uploads')&&Object.hasOwn(value,'input')&&Object.keys(value).length===3);if(match){hit++;throw failure;}return freeze(value);};
  await assert.rejects(parent.intoParts(),error=>error===failure);Object.freeze=freeze;assert.equal(hit,1);
  // Failure cannot consume real upload custody or lose the only cleanup path.
  await parent.check();assert.deepEqual(parent.readableSource(),baseline);await assert.rejects(foreign.cancel(secondAsset),error=>error.code==='asset_custody_busy');
  parts=await parent.intoParts();assert.deepEqual(parts.source.session.exportRecovery(),baseline);assert.deepEqual(await bytes(await parts.uploads.exportBackup()),f.value.uploads);assert.deepEqual(await bytes(parts.input.blob(f.value.f.reference.asset,f.value.f.reference.generation)),pixel);
 }finally{Object.freeze=freeze;await parts?.source.session.discardAndClose();parts?.uploads.close();foreign?.close();await parent?.discardAndClose();await f.close();}
});
test('unreturned snapshot wrappers expose no source or original provider',async()=>{
 const f=await restoredLocalFixture(host,capture),freeze=Object.freeze;let parent,parts,native=0,provider=0,outer=0;
 try{parent=await Parent.begin(f.file,{...f.options,cohort:{parentDatabase:f.value.f.tag+'-hidden-parent',uploadsDatabase:f.value.f.tag+'-hidden-uploads'}});
  Object.freeze=function(value){if(value&&typeof value==='object'){
   if(Object.hasOwn(value,'session')&&Object.keys(value).length===1){native++;assert.throws(()=>value.session,error=>error.code==='restored_local_handoff_closed');}
   if(Object.hasOwn(value,'file')&&Object.hasOwn(value,'blob')&&Object.keys(value).length===2){provider++;assert.throws(()=>value.file(),error=>error.code==='restored_local_handoff_closed');}
   if(Object.hasOwn(value,'source')&&Object.hasOwn(value,'uploads')&&Object.hasOwn(value,'input')&&Object.keys(value).length===3){outer++;for(const k of['source','uploads','input'])assert.throws(()=>value[k],error=>error.code==='restored_local_handoff_closed');}
  }return freeze(value);};parts=await parent.intoParts();Object.freeze=freeze;assert.deepEqual([native,provider,outer],[1,1,1]);assert.ok(parts.source.session);assert.ok(parts.uploads);assert.deepEqual(await bytes(parts.input.file()),await bytes(f.file));
 }finally{Object.freeze=freeze;await parts?.source.session.discardAndClose();parts?.uploads.close();await parent?.discardAndClose();await f.close();}
});
