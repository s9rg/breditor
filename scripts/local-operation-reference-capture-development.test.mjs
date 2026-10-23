/** Local-only native replay and versions stay local; no delivery port is used.
 * Native/retained epoch, read authority and physical stored bytes are separate. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {captureLocalOperationBackup} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {LocalOperationReferenceCapture as Capture,captureLocalOperationReferences as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/reference_capture.js';
import {independentHistoryNative as port} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {localParticipantFixture} from './fixtures/independent-local-operation/participant.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {secondAsset} from './fixtures/review-assets/pixels.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url),file=pathToFileURL(runtime.pathname+'breditor_shared.js').href,bytes=readFileSync(new URL('breditor_shared_bg.wasm',runtime)),root=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let pa,pb;
before(async()=>{const a=await import(file),b=await import(file+'?local-reference-reader');await a.default({module_or_path:bytes});await b.default({module_or_path:bytes});pa=nativeProfile(a,3,true);pb=nativeProfile(b,3,true);assert.notEqual(a.SharedRichProfile,b.SharedRichProfile);});after(()=>{pb?.free();pa?.free();});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const separate of [false,true])for(const expired of [false,true])test(`local native reference read, document=${documentSegmented}/review=${reviewSegmented}/reader=${separate}/expired=${expired}`,async()=>{
 const tag='local-refs-'+Number(documentSegmented)+Number(reviewSegmented)+Number(separate)+Number(expired),generation='pending-local-image-'+tag;let f,parts,read,empty,faults;
 try{
  f=await localParticipantFixture({api,rich,Participant,profile:pa,root,tag,documentSegmented,reviewSegmented});parts=await f.take(await f.begin(await f.recover()));const source=parts.source.session;
  const thread=source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Local reference comment'}}).event;source.core.dispatchReview({kind:'reply',data:{thread,body:'Local reference review Redo'}});source.core.undoReview();insertCleanupText(source.core,'Local reference CURRENT ');await source.flush();
  faults=recoveryFaults();faults.select(f.options.sourceDatabase,'local_operation_history_heads',1,'abort');const image=source.core.documentJson();const tree=JSON.parse(image),blocks=tree.root.children;const imageBlock=blocks.find(row=>row.type==='breditor/image');assert.ok(imageBlock);source.core.dispatch({commands:[{kind:'replace_image',data:{block:imageBlock.properties['breditor/block-id'],asset:secondAsset,generation}}]});await assert.rejects(source.flush());faults.clear();f.setAllowed(false);assert.equal(source.core.undo(),true);await assert.rejects(source.flush());if(!expired)f.setAllowed(true);
  if(expired){f.setAllowed(false);await assert.rejects(source.flush());}
  const base=f.options.recovery.session,history=base.documentHistory,restore=checkpoint=>documentSegmented?pb.restore_segmented('room',checkpoint):pb.restore('room',checkpoint),session=separate?{...base,documentHistory:documentSegmented?{...history,restoreSegmented:restore}:{...history,restoreOriginal:restore}}:base,readOptions={session,checkAuthority(){}};
  empty=await rich.RichAssetStore.open(tag+'-empty-uploads');const missing=await captureLocalOperationBackup({source,assets:empty,...readOptions});assert.equal(missing.kind,'pending');assert.ok(JSON.stringify(missing.pending).includes(secondAsset));
  const before=source.exportRecovery(),stamp=port(source).stamp(),stores=await snapshotReadDatabases();read=await capture({source,...readOptions});read.check();await read.verify();read.checkCurrent();const metadata=read.metadata();assert.equal(metadata.kind,'ready');assert.equal(metadata.scope,'original-current-pending-live-local-native-and-versions');assert.deepEqual(metadata.states.map(row=>row.slot),['original','current','pending','live']);assert.ok(metadata.references.some(row=>row.asset===secondAsset&&row.generation===generation));assert.ok(metadata.states.find(row=>row.slot==='pending').references.some(row=>row.generation===generation));assert.deepEqual(source.exportRecovery(),before);assert.equal(port(source).stamp(),stamp);assert.deepEqual(await snapshotReadDatabases(),stores);assert.throws(()=>Capture.prototype.check.call(metadata));assert.ok(Object.isFrozen(metadata)&&Object.isFrozen(metadata.states));
  f.setAllowed(true);await source.retry();assert.deepEqual(source.exportRecovery(),before);assert.equal(port(source).stamp(),stamp);assert.throws(()=>read.check(),error=>error.code==='independent_local_operation_reference_changed');assert.throws(()=>read.checkCurrent(),error=>error.code==='independent_local_operation_reference_changed');await assert.rejects(read.verify(),error=>error.code==='independent_local_operation_reference_changed');read.dispose();read=undefined;assert.equal(source.core.redo(),true);assert.equal(source.core.undo(),true);assert.equal(source.core.redoReview().kind,'committed');assert.equal(source.core.undoReview().kind,'committed');
 }finally{faults?.clear();read?.dispose();empty?.close();f?.setAllowed(true);await f?.close();faults?.restore();}
});
async function localFixture(tag){const f=await localParticipantFixture({api,rich,Participant,profile:pa,root,tag});try{const parts=await f.take(await f.begin(await f.recover()));return{f,source:parts.source.session,readOptions:{session:f.options.recovery.session,checkAuthority(){}}};}catch(error){await f.close();throw error;}}
test('local reference proof survives a completed read-only journal status inspection',async()=>{
 const{f,source,readOptions}=await localFixture('local-reference-status');let read;
 try{read=await capture({source,...readOptions});const before=source.exportRecovery(),stores=await snapshotReadDatabases(),stamp=port(source).stamp();await port(source).localOperation.progress();assert.equal(port(source).stamp(),stamp);assert.deepEqual(source.exportRecovery(),before);assert.deepEqual(await snapshotReadDatabases(),stores);read.checkCurrent();read.check();await read.verify();}finally{read?.dispose();await f.close();}
});
test('local reference cancellation holds cleanup until explicit release',async()=>{
 const{f,source,readOptions}=await localFixture('local-reference-cancellation');let read,closed=false;
 try{const abort=new AbortController();read=await capture({source,...readOptions,signal:abort.signal});abort.abort();assert.throws(()=>read.check());assert.throws(()=>read.checkCurrent());const closing=source.discardAndClose().then(()=>{closed=true;});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(closed,false);read.dispose();read=undefined;await closing;assert.equal(closed,true);}finally{read?.dispose();await f.close();}
});
test('local reference policy refuses accessors before invoking host code',async()=>{
 for(const name of ['source','session','checkAuthority','signal','limits']){let called=0;const options={source:{},session:{},checkAuthority(){}};Object.defineProperty(options,name,{enumerable:true,get(){called++;throw Error('Untrusted getter');}});await assert.rejects(capture(options),error=>error.code==='independent_local_operation_reference_policy');assert.equal(called,0);}
});
test('late local read failures release every unreturned journal borrow',{timeout:60000},async()=>{
 const{f,source,readOptions}=await localFixture('local-reference-late-authority');let read,calls=0,at=Infinity;const checkAuthority=()=>{if(++calls===at)throw Error('Read grant ended');};
 try{read=await capture({source,...readOptions,checkAuthority});const total=calls;read.dispose();read=undefined;assert.ok(total>10);for(at=total-9;at<=total;at++){calls=0;await assert.rejects(capture({source,...readOptions,checkAuthority}));const next=await capture({source,...readOptions});next.check();next.dispose();}}finally{at=Infinity;read?.dispose();await f.close();}
});
test('local read revocation is separate from write permission and the final fence is callback-free',async()=>{
 const{f,source,readOptions}=await localFixture('local-reference-read-grant');let read,allowed=true,calls=0;
 try{f.setAllowed(false);insertCleanupText(source.core,'Unsaved without write grant ');await assert.rejects(source.flush());read=await capture({source,...readOptions,checkAuthority(){calls++;if(!allowed)throw Error('Independent read grant ended');}});read.check();const before=calls;read.checkCurrent();assert.equal(calls,before);allowed=false;assert.throws(()=>read.check());read.dispose();assert.throws(()=>read.checkCurrent(),error=>error.code==='independent_local_operation_reference_closed');await assert.rejects(source.flush());allowed=true;const next=await capture({source,...readOptions});next.dispose();}finally{allowed=true;read?.dispose();f.setAllowed(true);await f.close();}
});
test('local durable verification re-admits original bytes independently of native epochs',async()=>{
 const{f,source,readOptions}=await localFixture('local-reference-durable');let read,original;
 try{read=await capture({source,...readOptions});await read.verify();await change(f.options.journalDatabase,'local_operation_original',store=>{const q=store.get('participant');q.onsuccess=()=>{original=q.result;store.put(new Blob(['Changed original bytes']),'participant');};});read.checkCurrent();await assert.rejects(read.verify());await change(f.options.journalDatabase,'local_operation_original',store=>store.put(original,'participant'));original=undefined;await read.verify();}finally{if(original)await change(f.options.journalDatabase,'local_operation_original',store=>store.put(original,'participant'));read?.dispose();await f.close();}
});
test('local reentrant read callbacks refuse without poisoning the proof',async()=>{
 const{f,source,readOptions}=await localFixture('local-reference-reentry');let read,reenter=false;
 try{read=await capture({source,...readOptions,checkAuthority(){if(reenter)read.check();}});reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;read.check();await read.verify();read.checkCurrent();const metadata=read.metadata();read.dispose();read.dispose();assert.equal(read.metadata(),metadata);await assert.rejects(read.verify(),error=>error.code==='independent_local_operation_reference_closed');}finally{reenter=false;read?.dispose();await f.close();}
});
