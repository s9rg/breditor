/** Actual two-archive generation parents; independent permission, never a handoff. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {captureGenerationOperationalRecords as capture} from '../packages/breditor-collaboration/dist/generation_operation/operation.js';
import {generationOperationalFixture} from './fixtures/original-operational-read/generation_session.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {change} from './fixtures/independent-delivery-recovery/storage.mjs';
let profile,sequence=0;before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const fixture=(extra={})=>generationOperationalFixture({api,rich,profile,tag:'generation-operational-read-'+sequence++,...extra});
for(const family of['generation','generation-paired','relay','retained'])for(const scope of[0,1,2])for(const mask of[0,1,2,3,4,5,6,7].filter(m=>family!=='generation'||!(m&2)))test(`fresh ${family} parent keeps both actual original files ${scope}/${mask}`,async()=>{
 const f=await fixture({family,scope,mask});let read,refs,parts;
 try{f.grant.allowed=false;const calls=f.grant.calls,before=await snapshotReadDatabases();read=await capture(f.parent,()=>{});assert.equal(read.metadata().scope,'held-generation-parent-markers-and-two-archives');assert.deepEqual(read.files().map(f=>f.role),['recovery-origin','operation-origin']);for(const row of read.files())assert.deepEqual(Buffer.from(await row.file.arrayBuffer()),Buffer.from(await f.backup.file().arrayBuffer()));refs=await read.captureReferences({restoreSegmented:s=>profile.restore_segmented('room',s),checkAuthority(){}});await refs.verify();await read.verify();refs.checkCurrent();read.checkCurrent();assert.equal(f.grant.calls,calls);assert.deepEqual(await snapshotReadDatabases(),before);assert.equal('intoParts'in read,false);await assert.rejects(f.parent.intoParts(),e=>e.code==='generation_operation_busy');refs.dispose();refs=undefined;read.dispose();read=undefined;await assert.rejects(f.parent.progress());f.grant.allowed=true;parts=await f.parent.intoParts();assert.equal(parts.source.session.core.redo(),true);assert.equal(parts.source.session.core.undo(),true);if(f.selected.paired){assert.equal(parts.source.session.core.redoReview().kind,'committed');assert.equal(parts.source.session.core.undoReview().kind,'committed');}await parts.source.session.discardAndClose();parts.uploads.close();parts=undefined;}
 finally{refs?.dispose();read?.dispose();if(parts){await parts.source.session.discardAndClose();parts.uploads.close();}await f.close();}
});
for(const[database,store,key]of[['operation','generation_origin','participant'],['recovery','generation_files','original']])test(`actual ${database} original must remain admitted`,async()=>{
 const f=await fixture();let read,original;
 try{read=await capture(f.parent,()=>{});await change(f.tag+'-'+database,store,s=>{const q=s.get(key);q.onsuccess=()=>{original=q.result;s.put(new Blob(['changed archive']),key);};});read.checkCurrent();await assert.rejects(read.verify());await change(f.tag+'-'+database,store,s=>s.put(original,key));original=undefined;await read.verify();}
 finally{if(original)await change(f.tag+'-'+database,store,s=>s.put(original,key));read?.dispose();await f.close();}
});
for(const[database,store,key]of[['operation','generation_operation','state'],['recovery','generation_attempts','attempt']])test(`actual ${database} phase cannot be replaced by a cached ready flag`,async()=>{
 const f=await fixture();let read,original;
 try{read=await capture(f.parent,()=>{});await change(f.tag+'-'+database,store,s=>{const q=s.get(key);q.onsuccess=()=>{original=q.result;s.put({...original,phase:database==='operation'?'prepared':'preparing'},key);};});read.checkCurrent();await assert.rejects(read.verify());await change(f.tag+'-'+database,store,s=>s.put(original,key));original=undefined;await read.verify();}
 finally{if(original)await change(f.tag+'-'+database,store,s=>s.put(original,key));read?.dispose();await f.close();}
});
test('old job cancellation and grant do not control a new independently permitted parent read',async()=>{
 const old=new AbortController(),f=await fixture({oldSignal:old.signal});let read,refs;
 try{old.abort();f.grant.allowed=false;const calls=f.grant.calls,before=await snapshotReadDatabases();read=await capture(f.parent,()=>{});refs=await read.captureReferences({restoreSegmented:s=>profile.restore_segmented('room',s),checkAuthority(){}});await refs.verify();await read.verify();refs.checkCurrent();read.checkCurrent();assert.equal(f.grant.calls,calls);assert.deepEqual(await snapshotReadDatabases(),before);refs.dispose();refs=undefined;read.dispose();read=undefined;await assert.rejects(f.parent.progress());}
 finally{refs?.dispose();read?.dispose();await f.close();}
});
test('fresh permission, cancellation, failure cleanup and reentry keep namespace custody unchanged',async()=>{
 const f=await fixture();let read,allowed=true,reenter=false;const guard=()=>{if(!allowed)throw Error('Read ended');if(reenter)read.check();};
 try{for(const value of[null,0,{},'read'])await assert.rejects(capture(f.parent,value));allowed=false;await assert.rejects(capture(f.parent,guard));allowed=true;read=await capture(f.parent,guard);reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;allowed=false;assert.throws(()=>read.files());allowed=true;await read.verify();const m=read.metadata();read.dispose();read.dispose();assert.equal(read.metadata(),m);assert.throws(()=>read.sources());const abort=new AbortController();read=await capture(f.parent,()=>{},abort.signal);abort.abort();assert.throws(()=>read.checkCurrent(),e=>e.code==='generation_parent_record_aborted');read.dispose();read=await capture(f.parent,()=>{});await read.verify();}
 finally{allowed=true;reenter=false;read?.dispose();await f.close();}
});
test('generation parent lookalikes cannot authorize or supply projected sources',async()=>{
 let calls=0;for(const parent of[{},Object.create(api.OperationalSharedGenerationParticipant.prototype)]){Object.defineProperty(parent,'file',{get(){calls++;throw Error('Fake');}});await assert.rejects(capture(parent,()=>{calls++;}));}assert.equal(calls,0);
});
test('a generation read handle exposes no editable child after old-grant revocation',async()=>{
 const f=await fixture();let read;
 try{f.grant.allowed=false;read=await capture(f.parent,()=>{});let changed=false;if(typeof read.sources==='function'){const source=read.sources().source.session,before=source.core.checkpointJson();insertCleanupText(source.core,'A read must not expose this edit path ');await source.flush();changed=source.core.checkpointJson()!==before;}assert.equal(changed,false);assert.equal('sources'in read,false);assert.equal('core'in read,false);}
 finally{read?.dispose();await f.close();}
});
test('parent disposal closes its opaque generation child before namespace handoff',async()=>{
 const f=await fixture();let read,refs,parts;
 try{read=await capture(f.parent,()=>{});const options={restoreSegmented:s=>profile.restore_segmented('room',s),checkAuthority(){}};refs=await read.captureReferences(options);await assert.rejects(read.captureReferences(options),e=>e.code==='operational_parent_read_busy');const m=refs.metadata();read.dispose();assert.throws(()=>refs.checkCurrent());assert.equal(refs.metadata(),m);parts=await f.parent.intoParts();assert.equal(parts.source.session.core.redo(),true);await parts.source.session.discardAndClose();parts.uploads.close();parts=undefined;}
 finally{refs?.dispose();read?.dispose();if(parts){await parts.source.session.discardAndClose();parts.uploads.close();}await f.close();}
});
test('read options cannot replace the held generation source or evaluate getters',async()=>{
 const f=await fixture();let read,refs,calls=0;
 try{read=await capture(f.parent,()=>{});const options={restoreSegmented:s=>{calls++;return profile.restore_segmented('room',s);},checkAuthority(){calls++;}};for(const key of['source','kind','versions','suggestions','revisions'])await assert.rejects(read.captureReferences({...options,[key]:{}}),e=>e.code==='operational_parent_reference_policy');for(const key of['restoreSegmented','checkAuthority','editor']){const value={...options};Object.defineProperty(value,key,{enumerable:true,get(){calls++;throw Error('No getter');}});await assert.rejects(read.captureReferences(value),e=>e.code==='operational_parent_reference_policy');}assert.equal(calls,0);refs=await read.captureReferences({restoreSegmented:s=>profile.restore_segmented('room',s),checkAuthority(){}});await refs.verify();}
 finally{refs?.dispose();read?.dispose();await f.close();}
});
test('late generation factories cannot return a child after its parent read is disposed',async()=>{
 const f=await fixture();let read;
 try{read=await capture(f.parent,()=>{});await assert.rejects(read.captureReferences({restoreSegmented:s=>{const raw=profile.restore_segmented('room',s);read.dispose();return raw;},checkAuthority(){}}));await f.parent.check();read=await capture(f.parent,()=>{});const refs=await read.captureReferences({restoreSegmented:s=>profile.restore_segmented('room',s),checkAuthority(){}});await refs.verify();refs.dispose();}
 finally{read?.dispose();await f.close();}
});
