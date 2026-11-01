/** Actual normal Wasm publications: cached scalar DATA never grants lifetime. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {coreReadState} from '../packages/breditor-collaboration/dist/core_read_state.js';
import {managedCoreRetainedRevisions} from '../packages/breditor-collaboration/dist/managed_custody.js';
import {cleanupEnvironment} from './fixtures/owned-core-cleanup/environment.mjs';
import {cleanupFamilies,nativeProfile,cleanupSession,insertCleanupText,cleanupNativePair} from './fixtures/owned-core-cleanup/session.mjs';
let profile,sequence=0;
before(async()=>{await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native);});
after(()=>profile?.free());
const check=core=>{const view=core.view(),state=coreReadState(core);assert.deepEqual(state,{documentRevision:view.revision,readOnly:view.readOnly===true});assert.ok(Object.isFrozen(state));assert.equal(managedCoreRetainedRevisions(core).documentRevision,view.revision);return state;};

for(const family of cleanupFamilies)test('scalar publication follows actual edits, history, readonly and lifetime: '+family,async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family,database:'native-publication-state-'+sequence++});let session;
 try{
  session=await selected.open();const core=session.core,initial=check(core),view=core.view();view.revision='forged';view.readOnly=true;assert.deepEqual(coreReadState(core),initial);
  const exact=cleanupNativePair(core,selected);insertCleanupText(core,'Current publication ');check(core);const edited=cleanupNativePair(core,selected);core.undo();check(core);assert.equal(core.documentJson().includes('Current publication'),false);core.redo();check(core);assert.equal(core.documentJson().includes('Current publication'),true);
  if(selected.paired){core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Current comment'}});check(core);core.undoReview();check(core);core.redoReview();check(core);}
  const beforeReadOnly=check(core);core.setReadOnly(true);assert.equal(check(core).readOnly,true);assert.notEqual(coreReadState(core),beforeReadOnly);assert.throws(()=>insertCleanupText(core,'Refused'),error=>error.code==='read_only');core.setReadOnly(false);assert.equal(check(core).readOnly,false);
  assert.notEqual(edited[0],exact[0]);const final=check(core),retained=managedCoreRetainedRevisions(core);core.retire();assert.deepEqual(coreReadState(core),final);core.dispose();assert.throws(()=>coreReadState(core),error=>error.code==='disposed');assert.deepEqual(managedCoreRetainedRevisions(core),retained);
 }finally{try{await session?.discardAndClose();}finally{environment.restore();}}
});

test('unchanged scalar/custody reads never reparse complete editor views',async()=>{
 const environment=cleanupEnvironment(),selected=cleanupSession(api,profile,{family:'independent-both',database:'native-publication-state-budget'});let session;
 try{
  session=await selected.open();insertCleanupText(session.core,'A larger current document '.repeat(100));const state=check(session.core),parse=JSON.parse;let calls=0;
  JSON.parse=function(...args){calls++;return Reflect.apply(parse,JSON,args);};
  try{for(let i=0;i<10000;i++){assert.equal(coreReadState(session.core),state);assert.equal(managedCoreRetainedRevisions(session.core).documentRevision,state.documentRevision);}}finally{JSON.parse=parse;}
  assert.equal(calls,0);assert.deepEqual(coreReadState(session.core),state);check(session.core);
 }finally{try{await session?.discardAndClose();}finally{environment.restore();}}
});

test('publication callbacks observe current readonly DATA and isolated public views',()=>{
 const selected=cleanupSession(api,profile),core=new api.SharedRichEditor(profile.create(selected.document,'101'));let notifications=0;
 try{core.subscribe(({view})=>{notifications++;assert.deepEqual(coreReadState(core),{documentRevision:view.revision,readOnly:view.readOnly===true});view.revision='changed copy';view.readOnly=!view.readOnly;check(core);});insertCleanupText(core,'Published ');core.setReadOnly(true);core.setReadOnly(false);assert.ok(notifications>=3);check(core);}finally{core.dispose();}
});

test('scalar readers reject facades and stay absent from the public package root',()=>{
 for(const value of [{},Object.create(api.SharedRichEditor.prototype),{view:()=>({revision:'0',readOnly:false})}])assert.throws(()=>coreReadState(value),error=>error.code==='core_read_unavailable');
 for(const name of ['coreReadState','registerCoreReadState'])assert.equal(name in api,false);
});
