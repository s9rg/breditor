/** Actual native incoming/source borrows. No caller-created source, disposition
 * flag or matching metadata substitutes for the closed local owner families. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {OperationalRestoredLocalParticipant as SnapshotParent} from '../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
import {OperationalFlatLocalParticipant as FlatParent} from '../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {captureLocalOperationBackup} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {NativeInputIncomingSourceCapture as Capture,nativeInputIncomingSource as incoming} from '../packages/breditor-collaboration/dist/native_input_operation/incoming_source.js';
import {checkCapturedNativeHistoryRead} from '../packages/breditor-collaboration/dist/native_history_read/registry.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
import {insertCleanupText,nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
const runtime=process.env.BREDITOR_NATIVE_INPUT_SOURCE_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>host?.free());
async function open(kind,extra={}){
 const f=kind==='snapshot-v1'?await restoredLocalFixture(host,captureLocalOperationBackup,extra):await flatLocalFixture(host,extra);let parent,parts;
 try{const value=kind==='snapshot-v1'?f.value:f.original.value,Parent=kind==='snapshot-v1'?SnapshotParent:FlatParent;
  parent=await Parent.begin(f.file,{...f.options,cohort:{parentDatabase:value.f.tag+'-incoming-parent',uploadsDatabase:value.f.tag+'-incoming-uploads'}});parts=await parent.intoParts();
  return{f,value,parent,parts,input:{kind,backup:f.backup},source:parts.source.session,options:{...value.readOptions,source:parts.source.session,input:{kind,backup:f.backup}},async close(){await parts.source.session.discardAndClose();parts.uploads.close();await parent.discardAndClose();await f.close();}};
 }catch(error){await parts?.source.session.discardAndClose();parts?.uploads.close();await parent?.discardAndClose();await f.close();throw error;}
}
for(const kind of['snapshot-v1','flat-local-v1'])for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])test(`actual incoming prefix survives later LIVE: ${kind}, document=${documentSegmented}, review=${reviewSegmented}`,async()=>{
 const v=await open(kind,{documentSegmented,reviewSegmented});let owner;
 try{
  const before=v.source.exportRecovery();insertCleanupText(v.source.core,'later ');v.source.core.dispatchReview({kind:'create_thread',data:{anchorJson:v.source.core.captureReviewAnchor({kind:'document'}),body:'later review'}});await v.source.flush();const live=v.source.exportRecovery();assert.notEqual(live.documentCheckpoint,before.documentCheckpoint);assert.notEqual(live.reviewCheckpoint,before.reviewCheckpoint);
  owner=await incoming.capture(v.options);const read=incoming.read({input:v.input,source:owner});assert.equal(read.kind,kind);assert.deepEqual(read.selected,v.f.backup.selection());assert.deepEqual(read.capture.metadata.identity,live.identity);assert.equal(read.capture.records[0].json,live.documentCheckpoint);assert.equal(read.capture.records[1].json,live.reviewCheckpoint);assert.equal(read.capture.records.length,2+live.versions.length);checkCapturedNativeHistoryRead(read.lanes);assert.equal(read.lanes.document.checkpointJson(),live.documentCheckpoint);assert.equal(read.lanes.review.checkpointJson(),live.reviewCheckpoint);
  assert.equal(incoming.owns(owner),true);assert.equal('NativeInputIncomingSourceCapture'in api,false);assert.throws(()=>api.captureSharedIndependentSource({session:v.source}));assert.throws(()=>api.captureSharedIndependentDeliverySource({session:v.source}));assert.throws(()=>incoming.read({input:{kind:kind==='snapshot-v1'?'flat-local-v1':'snapshot-v1',backup:v.input.backup},source:owner}));assert.throws(()=>new Capture({},{}));assert.throws(()=>incoming.read({input:v.input,source:Object.create(Capture.prototype)}));
  await v.source.retainVersion(v.source.core.captureVersion('Later retained packet','alice','72'));assert.throws(()=>incoming.read({input:v.input,source:owner}));assert.throws(()=>read.lanes.check());incoming.dispose(owner);owner=undefined;assert.throws(()=>read.lanes.document.checkpointJson());assert.throws(()=>checkCapturedNativeHistoryRead(read.lanes));await v.source.flush();
 }finally{if(owner)incoming.dispose(owner);await v.close();}
});
test('forged archives and another input family refuse before the native read factory',async()=>{
 const v=await open('flat-local-v1');let calls=0;
 try{const history=v.options.session.documentHistory,method=history.kind==='original'?'restoreOriginal':'restoreSegmented',session={...v.options.session,documentHistory:{...history,[method](checkpoint){calls++;return history[method].call(history,checkpoint);}}};
  for(const input of[{kind:'flat-local-v1',backup:{...v.f.backup}},{kind:'snapshot-v1',backup:v.f.original.backup},{kind:'flat-local-v1',backup:v.f.original.backup},{kind:'flat-local-v1',backup:v.f.backup,ready:true}])await assert.rejects(incoming.capture({...v.options,session,input}));assert.equal(calls,0);
  await assert.rejects(incoming.capture({...v.options,session,source:{core:v.source.core}}));assert.equal(calls,0);
 }finally{await v.close();}
});
test('read denial releases its actual borrow and a fresh grant can retry',async()=>{
 const v=await open('flat-local-v1');let owner;
 try{let denials=0;const denied=error=>error.code==='participant_authority';await assert.rejects(incoming.capture({...v.options,checkAuthority(){denials++;throw Error('denied');}}),denied);assert.equal(denials,1);let allowed=true;owner=await incoming.capture({...v.options,checkAuthority(){if(!allowed)throw Error('ended');}});const read=incoming.read({input:v.input,source:owner});allowed=false;assert.throws(()=>incoming.read({input:v.input,source:owner}),denied);assert.throws(()=>read.lanes.check(),denied);incoming.dispose(owner);owner=await incoming.capture(v.options);assert.ok(incoming.read({input:v.input,source:owner}));
 }finally{if(owner)incoming.dispose(owner);await v.close();}
});
test('mutation inside fresh native restoration refuses without returning a stale source',async()=>{
 const v=await open('flat-local-v1');let owner;
 try{const history=v.options.session.documentHistory,method=history.kind==='original'?'restoreOriginal':'restoreSegmented';let changed=false;const session={...v.options.session,documentHistory:{...history,[method](checkpoint){if(!changed){changed=true;insertCleanupText(v.source.core,'during read ');}return history[method].call(history,checkpoint);}}};await assert.rejects(incoming.capture({...v.options,session}));assert.equal(changed,true);await v.source.flush();owner=await incoming.capture(v.options);assert.equal(incoming.read({input:v.input,source:owner}).capture.records[0].json,v.source.exportRecovery().documentCheckpoint);
 }finally{if(owner)incoming.dispose(owner);await v.close();}
});
test('the last constructor and read wrappers remain inside the native stamp fence',async()=>{
 const v=await open('flat-local-v1'),freeze=Object.freeze;let owner,changed=false;
 try{
  Object.freeze=function(value){const result=freeze(value);if(value instanceof Capture&&!changed){assert.equal(incoming.owns(value),false);assert.throws(()=>incoming.read({input:v.input,source:value}));changed=true;insertCleanupText(v.source.core,'constructor callback ');}return result;};await assert.rejects(incoming.capture(v.options));Object.freeze=freeze;assert.equal(changed,true);await v.source.flush();owner=await incoming.capture(v.options);
  changed=false;const selected=v.f.backup.selection();Object.freeze=function(value){const result=freeze(value);if(!changed&&value&&typeof value==='object'&&Object.hasOwn(value,'manifestSha256')&&value.manifestSha256===selected.manifestSha256){changed=true;insertCleanupText(v.source.core,'last wrapper ');}return result;};assert.throws(()=>incoming.read({input:v.input,source:owner}));assert.equal(changed,true);
 }finally{Object.freeze=freeze;if(owner)incoming.dispose(owner);await v.close();}
});
test('the actual journal read scope delays shutdown until disposed',async()=>{
 const v=await open('flat-local-v1');let owner,closing;
 try{owner=await incoming.capture(v.options);let closed=false;closing=v.source.discardAndClose().then(()=>{closed=true;});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(closed,false);assert.throws(()=>incoming.read({input:v.input,source:owner}));incoming.dispose(owner);owner=undefined;await closing;assert.equal(closed,true);
 }finally{if(owner)incoming.dispose(owner);await closing;await v.close();}
});
test('a separately instantiated native reader compares its own two histories',async()=>{
 const v=await open('flat-local-v1'),native=await import(pathToFileURL(runtime+'/breditor_shared.js').href+'?native-input-incoming-reader');await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});const profile=nativeProfile(native,3,true);let owner;
 try{insertCleanupText(v.source.core,'runtime A ');await v.source.flush();const live=v.source.exportRecovery(),session={...v.options.session,documentHistory:{...v.options.session.documentHistory,restoreSegmented:checkpoint=>profile.restore_segmented('room',checkpoint)}};owner=await incoming.capture({...v.options,session});const read=incoming.read({input:v.input,source:owner});assert.equal(read.lanes.document.checkpointJson(),live.documentCheckpoint);assert.equal(read.lanes.review.checkpointJson(),live.reviewCheckpoint);assert.deepEqual(v.source.exportRecovery(),live);
 }finally{if(owner)incoming.dispose(owner);profile.free();await v.close();}
});
test('writable or incompatible fresh read factories refuse before execution',async()=>{
 const v=await open('flat-local-v1');let calls=0,owner;
 try{const history=v.options.session.documentHistory,method=history.kind==='original'?'restoreOriginal':'restoreSegmented',session={...v.options.session,documentHistory:{...history,[method](checkpoint){calls++;return history[method].call(history,checkpoint);}}};
  for(const bad of[{...session,readOnly:false},{...session,review:{...session.review,access:'comment'}},{...session,documentHistory:{kind:'original',restoreOriginal(){calls++;throw Error('Wrong factory executed');}}}])await assert.rejects(incoming.capture({...v.options,session:bad}));assert.equal(calls,0);owner=await incoming.capture({...v.options,session});assert.ok(calls>0);assert.ok(incoming.read({input:v.input,source:owner}));
 }finally{if(owner)incoming.dispose(owner);await v.close();}
});
