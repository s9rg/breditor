/** Original queue persistence is distinct from LIVE export after save failure.
 * Real normal Wasm and real original IndexedDB rows, never fabricated owners. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {borrowPersistentSuggestionRecords as borrow} from '../packages/breditor-collaboration/dist/suggestions/queue.js';
import {captureRecordedAssetReferences} from '../packages/breditor-collaboration/dist/asset_references_capture.js';
import {queueKey} from '../packages/breditor-collaboration/dist/suggestions/database.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {cleanupSession,nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
import {originalQueueFixture,persistentSuggestionDraft as draft} from './fixtures/persistent-suggestion-read/session.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url),seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let profile,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime.pathname+'breditor_shared.js'));await native.default({module_or_path:readFileSync(new URL('breditor_shared_bg.wasm',runtime))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const fixture=(extra={})=>originalQueueFixture({api,profile,seed,tag:'original-queue-read-'+sequence++,...extra});
test('original durable proposal remains visible after failed LIVE forgetting, with no source writes',async()=>{
 const f=await fixture(),faults=recoveryFaults();let read,live,stored;
 try{const info=f.queue.propose('Stored but no longer LIVE','1',draft());await f.queue.flush();f.queue.stopRetryingPublication(info.id);await f.queue.flush();const packet=f.queue.packet(info.id);faults.select(f.database,'suggestions',1,'abort');f.queue.forget(info.id);await assert.rejects(f.queue.flush());faults.clear();assert.deepEqual(f.queue.exportRecovery().retained,[]);const native=f.source.exportRecovery(),stores=await snapshotReadDatabases();live=api.captureSharedAssetReferences({core:f.source.core,suggestions:f.queue});assert.equal(live.metadata().outcome.kind,'ready');assert.equal(live.metadata().outcome.references.some(row=>row.asset==='persisted-only-image'),false);
  read=await borrow(f.queue,()=>{});read.check();await read.verify();read.checkCurrent();const metadata=read.metadata();assert.equal(metadata.committed.retained.length,1);assert.equal(metadata.committed.retained[0].packet,packet);assert.deepEqual(metadata.live.retained,[]);assert.deepEqual(metadata.pending.retained,[]);stored=captureRecordedAssetReferences(f.source.core,[{kind:'suggestions',read:()=>metadata.committed}],()=>read.check());assert.equal(stored.metadata().outcome.kind,'ready');assert.ok(stored.metadata().outcome.references.some(row=>row.asset==='persisted-only-image'));assert.deepEqual(f.source.exportRecovery(),native);assert.deepEqual(await snapshotReadDatabases(),stores);assert.ok(Object.isFrozen(metadata)&&Object.isFrozen(metadata.committed.retained));assert.throws(()=>f.queue.propose('Cannot race the owned read','2',draft('raced-image')));await assert.rejects(f.queue.retry());read.dispose();read=undefined;await f.queue.retry();assert.deepEqual(f.queue.exportRecovery().retained,[]);
 }finally{stored?.dispose();live?.dispose();read?.dispose();faults.clear();faults.restore();await f.close();}
});
test('original queue read checks actual durable row bytes, independently of LIVE and read permission',async()=>{
 const f=await fixture();let read,original,allowed=true,calls=0;
 try{f.queue.propose('Durable bytes','1',draft());await f.queue.flush();read=await borrow(f.queue,()=>{calls++;if(!allowed)throw Error('Read grant ended');});const before=calls;read.checkCurrent();assert.equal(calls,before);allowed=false;assert.throws(()=>read.check());allowed=true;const key=queueKey(f.identity);await change(f.database,'suggestions',store=>{const q=store.get(key);q.onsuccess=()=>{original=q.result;store.put({...original,retained:[]},key);};});read.checkCurrent();await assert.rejects(read.verify(),error=>error.code==='suggestion_persistent_read_changed');await change(f.database,'suggestions',store=>store.put(original,key));original=undefined;await read.verify();const metadata=read.metadata();read.dispose();read.dispose();assert.equal(read.metadata(),metadata);assert.throws(()=>read.check());await assert.rejects(read.verify());}finally{if(original)await change(f.database,'suggestions',store=>store.put(original,queueKey(f.identity)));read?.dispose();await f.close();}
});
test('invalid read authority cannot orphan the original queue gate',async()=>{
 const f=await fixture();let read;
 try{for(const value of[null,0,{},'read'])await assert.rejects(borrow(f.queue,value));read=await borrow(f.queue,()=>{});read.dispose();read=undefined;f.queue.propose('Still writable','1',draft());await f.queue.flush();}finally{read?.dispose();await f.close();}
});
test('prototype-only queues refuse without evaluating supplied source accessors',async()=>{
 let calls=0;const fake=Object.create(api.SharedSuggestionQueue.prototype);Object.defineProperty(fake,'core',{get(){calls++;throw Error('Do not invoke');}});await assert.rejects(borrow(fake,()=>{}),error=>error.code==='suggestion_persistent_read_source');assert.equal(calls,0);
});
test('cancellation and late read-policy failures release only their read reservation',async()=>{
 const f=await fixture();let read,calls=0,at=Infinity;const guard=()=>{if(++calls===at)throw Error('Late read loss');};
 try{read=await borrow(f.queue,guard);const total=calls;read.dispose();read=undefined;for(at=total-2;at<=total;at++){calls=0;await assert.rejects(borrow(f.queue,guard));const next=await borrow(f.queue,()=>{});next.dispose();}at=Infinity;const abort=new AbortController();read=await borrow(f.queue,()=>{},abort.signal);abort.abort();assert.throws(()=>read.checkCurrent(),error=>error.code==='suggestion_persistent_read_aborted');read.dispose();read=undefined;f.queue.propose('Writer remains owned','1',draft());await f.queue.flush();}finally{at=Infinity;read?.dispose();await f.close();}
});
test('read checks refuse replacement facade accessors without invoking them',async()=>{
 const f=await fixture();let read,calls=0;const original=Object.getOwnPropertyDescriptor(f.source,'core');
 try{read=await borrow(f.queue,()=>{});Object.defineProperty(f.source,'core',{configurable:true,get(){calls++;throw Error('Replacement getter');}});assert.throws(()=>read.checkCurrent());assert.equal(calls,0);}finally{if(original)Object.defineProperty(f.source,'core',original);else delete f.source.core;read?.dispose();await f.close();}
});
test('compound generation queues require their complete driver, not the original-store reader',async()=>{
 const reset=environment(),selected=cleanupSession(api,profile,{family:'retained',language:3,database:'persistent-read-compound'});let source,queue,calls=0;
 try{const identity={endpoint:'ws://127.0.0.1:1/ws',room:'room',principal:'alice',binding:'a'.repeat(64),documentWriter:'101',effectWriter:'900',writerTransport:'atomic-v2'};source=await api.SharedSegmentedRelaySession.openRetained({...selected.options,binding:{document:{endpoint:identity.endpoint,room:'room',principal:'alice',writer:'101',writerTransport:'atomic-v2'},review:{endpoint:identity.endpoint,room:'room',principal:'alice',actor:'comments',documentWriter:'101',binding:'b'.repeat(64),writerTransport:'atomic-v2'}},retained:{suggestions:{identity,ownedHistory:null},revisions:null,versions:null}});queue=await source.openSuggestionQueue();await assert.rejects(borrow(queue,()=>{calls++;}),error=>error.code==='suggestion_persistent_read_family');assert.equal(calls,0);}finally{await source?.discardAndClose();reset();}
});
test('ordinary custom storage remains editable but cannot issue managed original-store reads',async()=>{
 const f=await fixture();let queue;
 try{await f.queue.discardAndClose();queue=await api.SharedSuggestionQueue.open({database:f.database,identity:f.identity,storage:{core:f.source.core,save:()=>f.source.save(),flush:()=>f.source.flush()}});await assert.rejects(borrow(queue,()=>{}),error=>error.code==='suggestion_persistent_read_family');queue.propose('Ordinary custom storage','1',draft());await queue.flush();}finally{await queue?.discardAndClose();await f.close();}
});
for(const scope of[0,1,2])for(const mask of[0,2,4,6])for(const mode of['abort','lost-ack'])test(`actual original queue cut scope=${scope}/mask=${mask}/save=${mode}`,async()=>{
 const f=await fixture({scope,mask}),faults=recoveryFaults();let read;
 try{const proposal=f.queue.propose('Saved original proposal','1',draft());await f.queue.flush();f.queue.stopRetryingPublication(proposal.id);await f.queue.flush();const retained=f.queue.exportRecovery().retained;faults.select(f.database,'suggestions',1,mode);f.queue.forget(proposal.id);await assert.rejects(f.queue.flush());faults.clear();const native=f.source.exportRecovery(),stores=await snapshotReadDatabases();read=await borrow(f.queue,()=>{});read.checkCurrent();await read.verify();assert.deepEqual(read.metadata().live.retained,[]);assert.deepEqual(read.metadata().pending.retained,[]);assert.deepEqual(read.metadata().committed.retained,mode==='abort'?retained:[]);assert.deepEqual(f.source.exportRecovery(),native);assert.deepEqual(await snapshotReadDatabases(),stores);read.dispose();read=undefined;await f.queue.retry();}finally{read?.dispose();faults.clear();faults.restore();await f.close();}
});
test('an active save refuses the original record read without flushing or blocking its writer',async()=>{
 const f=await fixture();let read;
 try{f.queue.propose('An actual in-flight save','1',draft());await assert.rejects(borrow(f.queue,()=>{}),error=>error.code==='suggestion_recovery_in_use');await f.queue.flush();read=await borrow(f.queue,()=>{});await read.verify();}finally{read?.dispose();await f.close();}
});
test('a missing committed row refuses and never creates a replacement original record',async()=>{
 const f=await fixture(),key=queueKey(f.identity);let original,read;
 try{await change(f.database,'suggestions',store=>{const q=store.get(key);q.onsuccess=()=>{original=q.result;store.delete(key);};});const stores=await snapshotReadDatabases();await assert.rejects(borrow(f.queue,()=>{}),error=>error.code==='suggestion_persistent_read_missing');assert.deepEqual(await snapshotReadDatabases(),stores);await change(f.database,'suggestions',store=>store.put(original,key));original=undefined;read=await borrow(f.queue,()=>{});await read.verify();}finally{if(original)await change(f.database,'suggestions',store=>store.put(original,key));read?.dispose();await f.close();}
});
test('reentrant authority checks refuse without poisoning the original record handle',async()=>{
 const f=await fixture();let read,reenter=false;
 try{read=await borrow(f.queue,()=>{if(reenter)read.check();});reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;read.check();await read.verify();}finally{reenter=false;read?.dispose();await f.close();}
});
