import {NORMAL_SHARED_WASM_SHA256} from './fixtures/native-runtime/normal-shared-identity.mjs';
import {createHash} from 'node:crypto';
/** Genuine canonical Rust/Wasm + SDK. The incomplete-capability control wraps
 * an actual native owner; it is not evidence of executing a historical binary.
 * No persistence, credentials, comment adoption or serving claims. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as native from '../target/promoted-shared-web/breditor_shared.js';
import {SharedRichEditor,createSharedDocumentEditor,reserveNativeRecovery} from '../packages/breditor-collaboration/dist/core.js';
import {nativeProfile,cleanupSession} from './fixtures/owned-core-cleanup/session.mjs';
let profile,document;
const review={actor:'local-review',principal:'alice',access:'comment'},reviewed={binding:'a'.repeat(64),principal:'alice',effectWriter:'900'};
before(async()=>{const wasm=readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url));assert.equal(createHash('sha256').update(wasm).digest('hex'),NORMAL_SHARED_WASM_SHA256);await native.default({module_or_path:wasm});profile=nativeProfile(native,3,true);document=cleanupSession({},profile,{family:'original',language:3}).document;});
after(()=>{profile?.free();});
function fixture(config={}){
 const cores=[],options={...(config.scope===2?{selectionEditing:'document-v1'}:{}),...(config.reviewed?{reviewedHistory:reviewed}:{}),...(config.search?{searchHistory:'search-v1'}:{})};
 const own=(raw,extra={})=>{const core=new SharedRichEditor(raw,{...options,...extra});cores.push(core);return core;};
 const make=()=>{const core=own(profile.create(document,'101'));if(config.scope===1)core.enableGeneralRanges();if(config.typing)core.enableTypingHistory();if(config.segmented)core.enableSegmentedHistory('root','active');if(config.review)core.enableReview(review);return core;};
 const restore=core=>{const saved=core.checkpointJson(),raw=config.segmented?profile.restore_segmented('room',saved):config.search?profile.restore_search('room',saved):config.reviewed?profile.restore_reviewed('room',saved):config.scope===2?config.typing?profile.restore_document_typing('room',saved):profile.restore_document('room',saved):config.scope===1?config.typing?profile.restore_general_typing('room',saved):profile.restore_general('room',saved):config.typing?profile.restore_typing('room',saved):profile.restore('room',saved),next=own(raw,config.segmented?{segmentedHistory:'segmented-v1'}:{});if(config.review)next.enableReview(review,core.reviewCheckpoint());return next;};
 return{make,restore,own,peer:core=>{const peer=new SharedRichEditor(profile.join_frame('room','202',core.updateFrame()));cores.push(peer);return peer;},close(){for(const core of cores.reverse())core.dispose();}};
}
const insert=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
const configs=[{}, {typing:true},{scope:1,typing:true},{scope:2},{scope:2,typing:true},{scope:2,typing:true,reviewed:true,search:true},{scope:2,typing:true,reviewed:true,search:true,segmented:true,review:true}];
for(const[ordinal,config]of configs.entries())test('actual normal Wasm/SDK compatible document branch '+ordinal,async()=>{
 const f=fixture(config);let lease;try{
  const current=f.make();insert(current,'Common local ');if(config.review)current.dispatchReview({kind:'create_thread',data:{anchorJson:current.captureReviewAnchor({kind:'document'}),body:'Common comment'}});
  const source=f.restore(current),peer=f.peer(current);insert(peer,'Peer contribution ');await source.receiveFrame(peer.updateFrame());insert(current,'Offline suffix ');
  if(config.review)source.dispatchReview({kind:'create_thread',data:{anchorJson:source.captureReviewAnchor({kind:'document'}),body:'Source-only comment'}});
  const sourceBefore=source.checkpointJson(),commentBefore=config.review?current.reviewCheckpoint():null,sourceComment=config.review?source.reviewCheckpoint():null,origin=f.restore(current);
  assert.equal(current.supportsRetainedDocumentBranch(),true);assert.throws(()=>current.verifyRetainedDocumentBranch(source),e=>e.code==='retained_document_branch');
  lease=reserveNativeRecovery([current]);assert.equal(lease.reconcileDocumentBranch(current,source),true);current.verifyRetainedDocumentBranch(source);
  assert.equal(source.checkpointJson(),sourceBefore);if(config.review){assert.equal(current.reviewCheckpoint(),commentBefore);assert.equal(source.reviewCheckpoint(),sourceComment);assert.ok(!JSON.stringify(current.reviewSnapshot()).includes('Source-only comment'));}
  if(config.segmented)current.verifySegmentedRecoveryOrigin(origin);else current.verifyRecoveryOrigin(origin);
  assert.throws(()=>config.segmented?current.verifySegmentedRecoveryOrigin(source):current.verifyRecoveryOrigin(source));
  const stable=current.checkpointJson();assert.equal(lease.reconcileDocumentBranch(current,source),false);assert.equal(current.checkpointJson(),stable);assert.equal(lease.reconcileDocumentBranch(current,current),false);
  lease.close();lease=undefined;const merged=current.documentJson(),cold=f.restore(current);assert.equal(cold.undo(),true);assert.ok(!cold.documentJson().includes('Offline suffix'));assert.ok(cold.documentJson().includes('Peer contribution'));assert.equal(cold.undo(),true);assert.ok(cold.documentJson().includes('Peer contribution'));assert.equal(cold.redo(),true);assert.equal(cold.redo(),true);assert.equal(cold.documentJson(),merged);
 }finally{lease?.close();f.close();}
});

test('borrowed source stays excluded during real target publication and is released afterward',async()=>{
 const f=fixture({review:true});let lease;try{
  const current=f.make();insert(current,'Common ');const source=f.restore(current),peer=f.peer(current);insert(peer,'Peer ');await source.receiveFrame(peer.updateFrame());insert(current,'Own ');const before=source.checkpointJson(),calls=[];lease=reserveNativeRecovery([current]);
  Object.defineProperty(source,'supportsRetainedDocumentBranch',{get(){throw Error('A public override must never choose native capability');}});
  const unwatch=current.subscribe(()=>{for(const[name,fn]of[['close',()=>lease.close()],['target',()=>insert(current,'Forbidden')],['source',()=>insert(source,'Forbidden')],['review',()=>source.dispatchReview({kind:'create_thread',data:{anchorJson:source.captureReviewAnchor({kind:'document'}),body:'Forbidden'}})]]){let code;try{fn();}catch(error){code=error.code;}calls.push({name,code});}});
  assert.equal(lease.reconcileDocumentBranch(current,source),true);unwatch();assert.deepEqual(calls,[{name:'close',code:'native_recovery_busy'},{name:'target',code:'native_recovery_busy'},{name:'source',code:'native_recovery_busy'},{name:'review',code:'native_recovery_busy'}]);assert.equal(source.checkpointJson(),before);insert(source,'Allowed after call ');assert.ok(source.documentJson().includes('Allowed after call'));
 }finally{lease?.close();f.close();}
});

test('a source with a genuine held remote queue refuses without losing its queued frame',async()=>{
 const f=fixture();let lease,unhold;try{const current=f.make();insert(current,'Common ');const source=f.restore(current),peer=f.peer(current);insert(peer,'Queued peer ');unhold=source.holdRemotes();let settled=false;const queued=source.receiveFrame(peer.updateFrame()).then(value=>{settled=true;return value;});lease=reserveNativeRecovery([current]);const before=current.checkpointJson();assert.throws(()=>lease.reconcileDocumentBranch(current,source),e=>e.code==='native_recovery_busy');assert.equal(current.checkpointJson(),before);assert.equal(settled,false);unhold();unhold=undefined;await queued;assert.ok(source.documentJson().includes('Queued peer'));
 }finally{unhold?.();lease?.close();f.close();}
});

test('unknown own history, foreign members and unavailable native capability refuse before a target mutation',()=>{
 const f=fixture();let lease,old;try{const current=f.make();insert(current,'Common ');const source=f.restore(current);insert(source,'Unknown own suffix ');lease=reserveNativeRecovery([current]);const before=current.checkpointJson();assert.throws(()=>lease.reconcileDocumentBranch(current,source));assert.equal(current.checkpointJson(),before);assert.throws(()=>lease.reconcileDocumentBranch(current,Object.create(SharedRichEditor.prototype)),e=>e.code==='native_recovery_member');const incomplete=profile.create(document,'101'),hidden=new Set(['retained_document_branch_version','retained_document_branch_input_bytes','verify_retained_document_branch','reconcile_retained_document_branch']);old=new SharedRichEditor(new Proxy(incomplete,{get(target,key){if(hidden.has(key))return undefined;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}));assert.throws(()=>lease.reconcileDocumentBranch(current,old),e=>e.code==='retained_document_branch_unavailable');assert.equal(current.checkpointJson(),before);const staleRaw=profile.create(document,'101'),stale=f.own(new Proxy(staleRaw,{get(target,key){if(key==='retained_document_branch_version')return()=> '1';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}));assert.equal(stale.supportsRetainedDocumentBranch(),false);assert.throws(()=>lease.reconcileDocumentBranch(current,stale),e=>e.code==='retained_document_branch_unavailable');assert.equal(current.checkpointJson(),before);assert.throws(()=>lease.reconcileDocumentBranch(source,current),e=>e.code==='native_recovery_member');
 }finally{lease?.close();old?.dispose();f.close();}
});

test('branch import respects the actual target incoming-byte ceiling without consuming source work',async()=>{const f=fixture();let lease;try{const current=f.make();insert(current,'Common ');const source=f.restore(current),peer=f.peer(current);insert(peer,'Peer bytes above the selected ceiling ');await source.receiveFrame(peer.updateFrame());const limited=f.own(profile.restore('room',current.checkpointJson()),{maxPendingBytes:1}),before=limited.checkpointJson(),sourceBefore=source.checkpointJson();lease=reserveNativeRecovery([limited]);assert.throws(()=>lease.reconcileDocumentBranch(limited,source),e=>e.code==='remote_queue_full');assert.equal(limited.checkpointJson(),before);assert.equal(source.checkpointJson(),sourceBefore);assert.deepEqual(limited.pendingRemote(),{frames:0,bytes:0});lease.check();assertRawNativeByteCeiling();}finally{lease?.close();f.close();}});

/** Independent native enforcement still holds if an SDK preflight is bypassed. */
function assertRawNativeByteCeiling(){
 const target=profile.create(document,'101'),source=profile.restore('room',target.checkpoint()),peer=profile.join_frame('room','202',target.update_frame());let left,right,editing;
 try{
  editing=peer.observe();peer.dispatch(editing,JSON.stringify({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Native bound remains authoritative '}}]}));editing.free();editing=undefined;
  source.receive_frame(peer.update_frame());left=target.observe();right=source.observe();const before=target.checkpoint(),sourceBefore=source.checkpoint(),bytes=target.retained_document_branch_input_bytes(left,source,right);assert.ok(bytes>1);
  assert.equal(target.retained_document_branch_version(),'2');assert.throws(()=>target.reconcile_retained_document_branch(left,source,right,1));assert.equal(target.checkpoint(),before);assert.equal(source.checkpoint(),sourceBefore);
  assert.equal(target.reconcile_retained_document_branch(left,source,right,bytes),true);
 }finally{editing?.free();left?.free();right?.free();peer.free();source.free();target.free();}
}
