/** Actual original native rows are distinct from cached acknowledgement and LIVE. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {captureOriginalNativeRecords as capture} from '../packages/breditor-collaboration/dist/persistence/shared_session.js';
import {originalNativeFixture} from './fixtures/original-record-read/session.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const profiles=new Map();let sequence=0;
before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});for(const language of[1,2,3])profiles.set(language,nativeProfile(native,language,true));});after(()=>{for(const profile of profiles.values())profile.free();});
const fixture=(extra={})=>originalNativeFixture({api,profile:profiles.get(extra.language??3),tag:'original-native-read-'+sequence++,...extra});
for(const language of[1,2,3])for(const scope of[0,1,2])for(const mask of[0,1,4,5])for(const mode of['abort','lost-ack'])test(`original native committed/pending/unsaved LIVE ${language}/${scope}/${mask}/${mode}`,async()=>{
 const f=await fixture({language,scope,mask}),faults=recoveryFaults(),save=Object.getOwnPropertyDescriptor(f.source,'save');let read;
 try{const original=f.source.core.checkpointJson();faults.select(f.tag,'journals',1,mode);insertCleanupText(f.source.core,'Pending stored native ');await assert.rejects(f.source.flush());faults.clear();const pending=f.source.core.checkpointJson();Object.defineProperty(f.source,'save',{configurable:true,value(){}});insertCleanupText(f.source.core,'Unsaved original native ');const live=f.source.core.checkpointJson(),stores=await snapshotReadDatabases();read=await capture(f.source,()=>{});read.checkCurrent();await read.verify();const m=read.metadata();assert.equal(m.identity.richLanguage,language);assert.equal(m.committed.checkpoint,mode==='abort'?original:pending);assert.equal(m.pending.checkpoint,pending);assert.equal(m.live.checkpoint,live);assert.equal(m.committed.storageFamily,mask&4?'search-v1':scope===2?'document-v1':scope===1?'general-v1':mask&1?'typing-v1':'original');assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.identity)&&Object.isFrozen(m.committed));assert.equal(f.source.core.checkpointJson(),live);assert.deepEqual(await snapshotReadDatabases(),stores);if(save)Object.defineProperty(f.source,'save',save);else delete f.source.save;await f.source.retry();assert.throws(()=>read.checkCurrent(),error=>error.code==='native_record_read_changed');read.dispose();read=undefined;assert.equal(f.source.core.checkpointJson(),live);const document=f.source.core.documentJson();assert.equal(f.source.core.undo(),true);assert.equal(f.source.core.redo(),true);assert.equal(f.source.core.documentJson(),document);}
 finally{if(save)Object.defineProperty(f.source,'save',save);else delete f.source.save;read?.dispose();faults.clear();faults.restore();await f.close();}
});
test('native discovery reads canonical checkpoint methods, not public instance hooks',async()=>{
 const f=await fixture(),core=f.source.core,own=Object.getOwnPropertyDescriptor(core,'checkpointJson');let read,calls=0;
 try{const expected=core.checkpointJson();core.checkpointJson=()=>{calls++;throw Error('Replacement checkpoint hook');};read=await capture(f.source,()=>{});assert.equal(read.metadata().live.checkpoint,expected);await read.verify();read.checkCurrent();assert.equal(calls,0);}finally{if(own)Object.defineProperty(core,'checkpointJson',own);else delete core.checkpointJson;read?.dispose();await f.close();}
});
test('native discovery verifies actual bytes and missing rows without creating placeholders',async()=>{
 const f=await fixture();let read,original;
 try{read=await capture(f.source,()=>{});await change(f.tag,'journals',store=>{const q=store.get(['room','101']);q.onsuccess=()=>{original=q.result;store.put('private malformed payload',['room','101']);};});read.checkCurrent();await assert.rejects(read.verify(),error=>error.code==='native_record_read_record'&&!error.message.includes('private malformed'));await change(f.tag,'journals',store=>store.put(original,['room','101']));await read.verify();await change(f.tag,'journals',store=>store.delete(['room','101']));const stores=await snapshotReadDatabases();await assert.rejects(read.verify());await assert.rejects(capture(f.source,()=>{}),error=>error.code==='native_record_read_missing');assert.deepEqual(await snapshotReadDatabases(),stores);await change(f.tag,'journals',store=>store.put(original,['room','101']));original=undefined;await read.verify();}
 finally{if(original)await change(f.tag,'journals',store=>store.put(original,['room','101']));read?.dispose();await f.close();}
});
test('native read pins survive status but not a no-op persistence attempt',async()=>{
 const f=await fixture();let read;
 try{read=await capture(f.source,()=>{});f.source.state();await f.source.flush();read.checkCurrent();f.source.save();assert.throws(()=>read.checkCurrent(),error=>error.code==='native_record_read_changed');}
 finally{read?.dispose();await f.close();}
});
test('native independent read permission, cancellation and source closure do not edit a source',async()=>{
 const f=await fixture();let read,allowed=true,calls=0;
 try{f.source.core.setReadOnly(true);await f.source.flush();const abort=new AbortController();read=await capture(f.source,()=>{calls++;if(!allowed)throw Error('Read ended');},abort.signal);const count=calls;read.checkCurrent();assert.equal(calls,count);allowed=false;assert.throws(()=>read.check());allowed=true;await read.verify();assert.equal(f.source.core.view().readOnly,true);assert.throws(()=>insertCleanupText(f.source.core,'No author'));abort.abort();assert.throws(()=>read.checkCurrent(),error=>error.code==='native_record_read_aborted');const metadata=read.metadata();read.dispose();read=await capture(f.source,()=>{});await f.source.discardAndClose();assert.throws(()=>read.checkCurrent());read.dispose();assert.equal(metadata.scope,'original-native-committed-pending-live');}
 finally{read?.dispose();await f.close();}
});
test('native private source brands and replaced core accessors refuse without evaluating getters',async()=>{
 let calls=0;const fake=Object.create(api.SharedPersistentSession.prototype);Object.defineProperty(fake,'core',{get(){calls++;throw Error('Fake');}});await assert.rejects(capture(fake,()=>{}),error=>error.code==='native_record_read_source');const f=await fixture(),own=Object.getOwnPropertyDescriptor(f.source,'core');let read;
 try{read=await capture(f.source,()=>{});Object.defineProperty(f.source,'core',{configurable:true,get(){calls++;throw Error('Replacement');}});assert.throws(()=>read.checkCurrent());assert.equal(calls,0);}finally{Object.defineProperty(f.source,'core',own);read?.dispose();await f.close();}
});
test('native failed/reentrant policies and bounded reader lifetimes release every permit',async()=>{
 const f=await fixture(),reads=[];let read,calls=0,at=Infinity,reenter=false;const guard=()=>{if(++calls===at)throw Error('Late read loss');if(reenter)read.check();};
 try{for(const value of[null,0,{},'read'])await assert.rejects(capture(f.source,value));read=await capture(f.source,guard);const total=calls;read.dispose();read=undefined;for(at of[1,2,3,4,...Array(9).fill(total)]){calls=0;await assert.rejects(capture(f.source,guard));const next=await capture(f.source,()=>{});next.dispose();}at=Infinity;read=await capture(f.source,guard);reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;await read.verify();read.dispose();read=undefined;for(let i=0;i<8;i++)reads.push(await capture(f.source,()=>{}));await assert.rejects(capture(f.source,()=>{throw Error('No callback beyond capacity');}),error=>error.code==='native_record_read_busy');reads[0].dispose();reads.push(await capture(f.source,()=>{}));}
 finally{at=Infinity;reenter=false;read?.dispose();for(const value of reads)value.dispose();await f.close();}
});
test('native active saves refuse reads without waiting for or flushing the write',async()=>{
 const f=await fixture();let read;
 try{insertCleanupText(f.source.core,'In flight ');await assert.rejects(capture(f.source,()=>{}),error=>error.code==='native_record_read_changed');await f.source.flush();read=await capture(f.source,()=>{});await read.verify();}
 finally{read?.dispose();await f.close();}
});
