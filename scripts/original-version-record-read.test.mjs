/** Original version cache rows are not equivalent to LIVE or cached save flags. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {captureOriginalVersionRecords as capture} from '../packages/breditor-collaboration/dist/versions/catalog.js';
import {VersionCatalogStore,captureOriginalVersionStoreRecords as storeCapture} from '../packages/breditor-collaboration/dist/versions/store.js';
import {cacheKey} from '../packages/breditor-collaboration/dist/versions/database.js';
import {originalStoresFixture} from './fixtures/original-record-read/session.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let profile,sequence=0;
before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const fixture=(extra={})=>originalStoresFixture({api,profile,seed,tag:'original-version-read-'+sequence++,revisions:false,...extra});
const identity=f=>({endpoint:f.identity.endpoint,room:'room',principal:'alice',documentWriter:'101',binding:'d'.repeat(64),writerTransport:'atomic-v2'});
for(const scope of[0,1,2])for(const mask of[0,1,2,3,4,5,6,7])for(const mode of['abort','lost-ack'])test(`version committed/pending/LIVE ${scope}/${mask}/${mode}`,async()=>{
 const f=await fixture({scope,mask}),faults=recoveryFaults();let read;
 try{const v=f.versions.saveVersion('Saved original version','1');await f.versions.flush();await f.versions.stopRetryingVersion(v.id);const original=f.versions.exportRecovery();faults.select(f.tag+'-versions','catalogs',1,mode);await assert.rejects(f.versions.forgetCachedVersion(v.id));faults.clear();assert.equal(f.versions.exportRecovery().packets.length,0);const native=f.source.exportRecovery(),stores=await snapshotReadDatabases();read=await capture(f.versions,()=>{});read.checkCurrent();await read.verify();const m=read.metadata();assert.deepEqual(m.committed,mode==='abort'?original:m.live);assert.equal(m.pending.packets.length,0);assert.equal(m.live.packets.length,0);assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.committed.identity)&&Object.isFrozen(m.committed.packets));assert.throws(()=>f.versions.saveVersion('No mutation during read','2'),error=>error.code==='version_recovery_in_use');assert.throws(()=>f.versions.checkSource(f.source.core),error=>error.code==='version_recovery_in_use');read.checkCurrent();assert.deepEqual(f.source.exportRecovery(),native);assert.deepEqual(await snapshotReadDatabases(),stores);assert.equal(f.counts.networkCalls,0);read.dispose();read=undefined;await f.versions.retry();const next=f.versions.saveVersion('Writable after disposal','3');await f.versions.flush();assert.ok(f.versions.versionPacket(next.id));}
 finally{read?.dispose();faults.clear();faults.restore();await f.close();}
});
test('version reads revalidate actual rows, not merely the reserved adapter',async()=>{
 const f=await fixture(),key=cacheKey(identity(f));let read,original;
 try{f.versions.saveVersion('Actual packet','1');await f.versions.flush();read=await capture(f.versions,()=>{});await change(f.tag+'-versions','catalogs',store=>{const q=store.get(key);q.onsuccess=()=>{original=q.result;store.put({...original,packets:[]},key);};});read.checkCurrent();await assert.rejects(read.verify());await change(f.tag+'-versions','catalogs',store=>store.put(original,key));await read.verify();await change(f.tag+'-versions','catalogs',store=>store.delete(key));const stores=await snapshotReadDatabases();await assert.rejects(read.verify());read.dispose();read=undefined;await assert.rejects(capture(f.versions,()=>{}),error=>error.code==='version_record_read_missing');assert.deepEqual(await snapshotReadDatabases(),stores);await change(f.tag+'-versions','catalogs',store=>store.put(original,key));original=undefined;read=await capture(f.versions,()=>{});await read.verify();}
 finally{if(original)await change(f.tag+'-versions','catalogs',store=>store.put(original,key));read?.dispose();await f.close();}
});
test('version authority, cancellation and disposal keep native author access unchanged',async()=>{
 const f=await fixture();let read,allowed=true,calls=0;
 try{f.source.core.setReadOnly(true);f.source.core.setReviewAccess('read_only');await f.source.flush();const abort=new AbortController();read=await capture(f.versions,()=>{calls++;if(!allowed)throw Error('Read ended');},abort.signal);const count=calls;read.checkCurrent();f.versions.state();read.checkCurrent();assert.equal(calls,count);allowed=false;assert.throws(()=>read.check());allowed=true;await read.verify();assert.equal(f.source.core.view().readOnly,true);abort.abort();assert.throws(()=>read.checkCurrent(),error=>error.code==='version_record_read_aborted');const metadata=read.metadata();read.dispose();read.dispose();assert.equal(read.metadata(),metadata);assert.throws(()=>read.checkCurrent());await f.source.discardAndClose();await assert.rejects(capture(f.versions,()=>{}));}
 finally{read?.dispose();await f.close();}
});
test('version read gates release after invalid, late or reentrant read callbacks',async()=>{
 const f=await fixture();let read,calls=0,at=Infinity,reenter=false;const guard=()=>{if(++calls===at)throw Error('Late read ended');if(reenter)read.check();};
 try{for(const value of[null,0,{},'read'])await assert.rejects(capture(f.versions,value));read=await capture(f.versions,guard);const total=calls;read.dispose();read=undefined;for(at of[1,2,3,4,...Array(9).fill(total)]){calls=0;await assert.rejects(capture(f.versions,guard));const next=await capture(f.versions,()=>{});next.dispose();}at=Infinity;read=await capture(f.versions,guard);reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;await read.verify();await assert.rejects(f.versions.close(),error=>error.code==='version_recovery_in_use');read.dispose();read=undefined;f.versions.saveVersion('Gate released','2');await f.versions.flush();}
 finally{at=Infinity;reenter=false;read?.dispose();await f.close();}
});
test('version private brands and replaced source accessors do not evaluate getters',async()=>{
 let calls=0;const fake=Object.create(api.SharedDocumentVersions.prototype);Object.defineProperty(fake,'options',{get(){calls++;throw Error('Fake');}});await assert.rejects(capture(fake,()=>{}),error=>error.code==='version_record_read_source');const f=await fixture(),own=Object.getOwnPropertyDescriptor(f.source,'core');let read;
 try{read=await capture(f.versions,()=>{});Object.defineProperty(f.source,'core',{configurable:true,get(){calls++;throw Error('Replacement');}});assert.throws(()=>read.checkCurrent());assert.equal(calls,0);}finally{Object.defineProperty(f.source,'core',own);read?.dispose();await f.close();}
});
test('standalone version read permits are bounded and actual retry attempts invalidate their epoch',async()=>{
 const f=await fixture({versions:false}),reads=[];let store;
 try{store=await VersionCatalogStore.open({database:f.tag+'-raw-versions',identity:identity(f),storage:f.source,getToken:()=>'',autoConnect:false});for(let i=0;i<8;i++)reads.push(await storeCapture(store,()=>{}));await assert.rejects(storeCapture(store,()=>{throw Error('No callback beyond capacity');}),error=>error.code==='version_record_read_busy');store.state();await store.flush();for(const read of reads)read.checkCurrent();await store.retry();for(const read of reads)assert.throws(()=>read.checkCurrent(),error=>error.code==='version_record_read_changed');for(const read of reads)read.dispose();const read=await storeCapture(store,()=>{});reads.push(read);const own=Object.getOwnPropertyDescriptor(store,'options');let calls=0;Object.defineProperty(store,'options',{configurable:true,get(){calls++;throw Error('Replaced options');}});assert.throws(()=>read.checkCurrent());assert.equal(calls,0);Object.defineProperty(store,'options',own);}
 finally{for(const read of reads)read.dispose();await store?.discardAndClose();await f.close();}
});
test('ordinary custom version storage remains editable but does not issue managed record reads',async()=>{
 const f=await fixture({versions:false});let store;
 try{store=await VersionCatalogStore.open({database:f.tag+'-custom-versions',identity:identity(f),storage:{core:f.source.core,save:()=>f.source.save(),flush:()=>f.source.flush()},getToken:()=>'',autoConnect:false});await assert.rejects(storeCapture(store,()=>{}),error=>error.code==='version_record_read_family');store.saveVersion('Custom storage unchanged','1');await store.flush();}
 finally{await store?.discardAndClose();await f.close();}
});
test('in-flight version persistence refuses the read without flushing a producer',async()=>{
 const f=await fixture();let read;
 try{f.versions.saveVersion('Actual in-flight packet','1');await assert.rejects(capture(f.versions,()=>{}),error=>error.code==='version_record_read_changed');await f.versions.flush();read=await capture(f.versions,()=>{});await read.verify();}
 finally{read?.dispose();await f.close();}
});
