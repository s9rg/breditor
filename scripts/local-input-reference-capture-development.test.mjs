/** Snapshot and flat provenance use real native input parents, not final ASTs.
 * The same local-input reader must retain every imported native history cut. */
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
import {captureLocalInputOperationReferences as capture,LocalInputReferenceCapture as Capture} from '../packages/breditor-collaboration/dist/native_input_operation/reference_capture.js';
import {independentHistoryNative as port} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {secondAsset} from './fixtures/review-assets/pixels.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url),bytes=readFileSync(new URL('breditor_shared_bg.wasm',runtime));let host,other;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime:runtime.pathname,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});const b=await import(pathToFileURL(runtime.pathname+'breditor_shared.js').href+'?local-input-reference-reader');await b.default({module_or_path:bytes});other=nativeProfile(b,3,true);});after(()=>{other?.free();host?.free();});
async function fixture(kind,extra={}){
 const f=kind==='snapshot-v1'?await restoredLocalFixture(host,captureLocalOperationBackup,extra):await flatLocalFixture(host,extra),base=kind==='snapshot-v1'?f.value:f.original.value,tag=base.f.tag+'-reference-'+kind;let parent,parts,write=true;
 try{const options={...f.options,cohort:{parentDatabase:tag+'-parent',uploadsDatabase:tag+'-uploads'},checkAuthority(){if(!write)throw Error('Writer ended');}};parent=await(kind==='snapshot-v1'?SnapshotParent:FlatParent).begin(f.file,options);parts=await parent.intoParts();return{f,base,options,source:parts.source.session,uploads:parts.uploads,readOptions:base.readOptions,setWrite(value){write=value;},async close(){write=true;await parts.source.session.discardAndClose();parts.uploads.close();await parent.discardAndClose();await f.close();}};}catch(error){await parts?.source.session.discardAndClose();parts?.uploads.close();await parent?.discardAndClose();await f.close();throw error;}
}
for(const kind of['snapshot-v1','flat-local-v1'])for(const documentSegmented of[false,true])for(const reviewSegmented of[false,true])for(const separate of[false,true])for(const expired of[false,true])test(`${kind} all retained references document=${documentSegmented}/review=${reviewSegmented}/reader=${separate}/expired=${expired}`,{timeout:120000},async()=>{
 const f=await fixture(kind,{documentSegmented,reviewSegmented}),faults=recoveryFaults(),source=f.source,generation='pending-reference-'+kind+Number(documentSegmented)+Number(reviewSegmented)+Number(separate)+Number(expired);let read;
 try{insertCleanupText(source.core,'Local input CURRENT ');await source.flush();faults.select(f.options.sourceDatabase,'local_operation_history_heads',1,'abort');source.core.dispatch({commands:[{kind:'replace_image',data:{block:'image-block',asset:secondAsset,generation}}]});await assert.rejects(source.flush());faults.clear();f.setWrite(false);assert.equal(source.core.undo(),true);await assert.rejects(source.flush());if(!expired)f.setWrite(true);
  const base=f.readOptions.session,history=base.documentHistory,restore=checkpoint=>documentSegmented?other.restore_segmented('room',checkpoint):other.restore('room',checkpoint),session=separate?{...base,documentHistory:documentSegmented?{...history,restoreSegmented:restore}:{...history,restoreOriginal:restore}}:base;
  const before=source.exportRecovery(),stamp=port(source).stamp(),stores=await snapshotReadDatabases();read=await capture({source,...f.readOptions,session});read.check();await read.verify();read.checkCurrent();const metadata=read.metadata();assert.equal(metadata.inputKind,kind);assert.equal(metadata.kind,'ready');const incoming=metadata.states.filter(row=>row.slot==='input');assert.ok(incoming.length>=4);assert.deepEqual(incoming.map(row=>row.inputIndex),incoming.map((_,index)=>index));assert.deepEqual(metadata.states.slice(-3).map(row=>row.slot),['current','pending','live']);assert.ok(metadata.references.some(row=>row.asset===secondAsset&&row.generation===generation));assert.ok(metadata.states.find(row=>row.slot==='pending').references.some(row=>row.generation===generation));for(const ref of metadata.inputBindings)assert.ok(metadata.references.some(row=>row.asset===ref.asset&&row.generation===ref.generation));assert.deepEqual(source.exportRecovery(),before);assert.equal(port(source).stamp(),stamp);assert.deepEqual(await snapshotReadDatabases(),stores);assert.ok(Object.isFrozen(metadata)&&Object.isFrozen(metadata.states));assert.throws(()=>Capture.prototype.check.call(metadata));
  f.setWrite(true);await source.retry();assert.deepEqual(source.exportRecovery(),before);assert.equal(port(source).stamp(),stamp);assert.throws(()=>read.check());assert.throws(()=>read.checkCurrent());await assert.rejects(read.verify());read.dispose();read=undefined;assert.equal(source.core.redo(),true);assert.equal(source.core.undo(),true);
 }finally{faults.clear();faults.restore();read?.dispose();await f.close();}
});
for(const kind of['snapshot-v1','flat-local-v1'])test(`${kind} reference proof survives completed read-only journal status`,{timeout:120000},async()=>{
 const f=await fixture(kind);let read;
 try{read=await capture({source:f.source,...f.readOptions});const before=f.source.exportRecovery(),stamp=port(f.source).stamp(),stores=await snapshotReadDatabases();await port(f.source).localOperation.progress();assert.equal(port(f.source).stamp(),stamp);assert.deepEqual(f.source.exportRecovery(),before);assert.deepEqual(await snapshotReadDatabases(),stores);read.checkCurrent();read.check();await read.verify();}finally{read?.dispose();await f.close();}
});
for(const kind of['snapshot-v1','flat-local-v1'])test(`${kind} read lifetime, cancellation and callback-free fence`,{timeout:120000},async()=>{
 const f=await fixture(kind);let read,allowed=true,calls=0,closed=false;
 try{const abort=new AbortController();f.setWrite(false);insertCleanupText(f.source.core,'Unpublished read state ');await assert.rejects(f.source.flush());read=await capture({source:f.source,...f.readOptions,signal:abort.signal,checkAuthority(){calls++;if(!allowed)throw Error('Read grant ended');}});const before=calls;read.checkCurrent();assert.equal(calls,before);allowed=false;assert.throws(()=>read.check());allowed=true;await read.verify();abort.abort();assert.throws(()=>read.checkCurrent());const closing=f.source.discardAndClose().then(()=>{closed=true;});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(closed,false);const metadata=read.metadata();read.dispose();read.dispose();await closing;assert.equal(closed,true);assert.equal(read.metadata(),metadata);assert.throws(()=>read.check());await assert.rejects(read.verify());}finally{read?.dispose();await f.close();}
});
for(const kind of['snapshot-v1','flat-local-v1'])test(`${kind} verifies actual durable input bytes`,{timeout:120000},async()=>{
 const f=await fixture(kind),store=kind==='snapshot-v1'?'restored_local_operation_input':'flat_local_input_incoming';let read,original;
 try{read=await capture({source:f.source,...f.readOptions});await read.verify();await change(f.options.database,store,table=>{const q=table.get('incoming');q.onsuccess=()=>{original=q.result;table.put(new Blob(['Changed retained input']),'incoming');};});read.checkCurrent();await assert.rejects(read.verify());await change(f.options.database,store,table=>table.put(original,'incoming'));original=undefined;await read.verify();}finally{if(original)await change(f.options.database,store,table=>table.put(original,'incoming'));read?.dispose();await f.close();}
});
for(const kind of['snapshot-v1','flat-local-v1'])test(`${kind} late read failures release all unreturned borrows`,{timeout:120000},async()=>{
 const f=await fixture(kind);let read,calls=0,at=Infinity;const checkAuthority=()=>{if(++calls===at)throw Error('Read ended during admission');};
 try{read=await capture({source:f.source,...f.readOptions,checkAuthority});const total=calls;assert.ok(total>10);read.dispose();read=undefined;for(at=total-3;at<=total;at++){calls=0;await assert.rejects(capture({source:f.source,...f.readOptions,checkAuthority}));const next=await capture({source:f.source,...f.readOptions});next.check();next.dispose();}}finally{at=Infinity;read?.dispose();await f.close();}
});
for(const kind of['snapshot-v1','flat-local-v1'])test(`${kind} reentrant read callbacks cannot poison genuine custody`,{timeout:120000},async()=>{
 const f=await fixture(kind);let read,reenter=false;
 try{read=await capture({source:f.source,...f.readOptions,checkAuthority(){if(reenter)read.check();}});reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;read.check();await read.verify();read.checkCurrent();}finally{reenter=false;read?.dispose();await f.close();}
});
test('local input reference policy rejects every accessor without calling it',async()=>{for(const name of['source','session','checkAuthority','signal','limits']){let calls=0;const options={source:{},session:{},checkAuthority(){}};Object.defineProperty(options,name,{enumerable:true,get(){calls++;throw Error('getter');}});await assert.rejects(capture(options),error=>error.code==='local_input_reference_policy');assert.equal(calls,0);}});
