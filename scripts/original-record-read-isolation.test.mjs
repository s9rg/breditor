/** Functional custody boundaries shared by the three newly read original stores. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {captureOriginalVersionRecords} from '../packages/breditor-collaboration/dist/versions/catalog.js';
import {VersionCatalogStore} from '../packages/breditor-collaboration/dist/versions/store.js';
import {VersionCatalogSync} from '../packages/breditor-collaboration/dist/versions/sync.js';
import {captureOriginalRevisionRecords} from '../packages/breditor-collaboration/dist/suggestion_revisions/outbox.js';
import {queueKey} from '../packages/breditor-collaboration/dist/suggestions/database.js';
import {originalStoresFixture,imageDraft as draft} from './fixtures/original-record-read/session.mjs';
import {generationRecordFixture} from './fixtures/persistent-suggestion-read/generation_session.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let profile,sequence=0;
before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const fixture=(extra={})=>originalStoresFixture({api,profile,seed,tag:'original-record-isolation-'+sequence++,...extra});
test('failed version adapter discovery never retries, clears failure or changes publication state',async()=>{
 const f=await fixture({revisions:false}),faults=recoveryFaults();let read;
 try{f.versions.saveVersion('Failed publication','1');await f.versions.flush();faults.select(f.tag+'-versions','catalogs',1,'abort');f.versions.saveVersion('Pending failed packet','2');await assert.rejects(f.versions.flush());faults.clear();const state=f.versions.state(),stores=await snapshotReadDatabases();assert.equal(state.status,'local-save-failed');read=await captureOriginalVersionRecords(f.versions,()=>{});read.check();await read.verify();read.checkCurrent();assert.deepEqual(f.versions.state(),state);assert.deepEqual(await snapshotReadDatabases(),stores);assert.equal(f.counts.networkCalls,0);read.dispose();read=undefined;assert.deepEqual(f.versions.state(),state);await f.versions.retry();assert.equal(f.versions.state().localPending,false);}
 finally{read?.dispose();faults.clear();faults.restore();await f.close();}
});
test('old writable version recovery still refuses failed adapters while the separate read reservation is non-mutating',async()=>{
 const f=await fixture({revisions:false,versions:false}),faults=recoveryFaults();let store,sync,release;
 try{const identity={endpoint:f.identity.endpoint,room:'room',principal:'alice',documentWriter:'101',binding:'d'.repeat(64),writerTransport:'atomic-v2'};store=await VersionCatalogStore.open({database:f.tag+'-versions',identity,storage:f.source,getToken:()=>{throw Error('No token');},autoConnect:false});sync=new VersionCatalogSync(store);faults.select(f.tag+'-versions','catalogs',1,'abort');store.saveVersion('Failed original API save','1');await assert.rejects(store.flush());faults.clear();assert.equal(sync.state().status,'local-save-failed');assert.throws(()=>sync.reserveLocalRecovery(),error=>error.code==='version_recovery_in_use');const before=sync.state();release=sync.reserveLocalRead();assert.deepEqual(sync.state(),before);await assert.rejects(sync.connect(),error=>error.code==='version_recovery_in_use');await assert.rejects(sync.refresh(),error=>error.code==='version_recovery_in_use');release();release=undefined;assert.deepEqual(sync.state(),before);assert.throws(()=>sync.reserveLocalRecovery(),error=>error.code==='version_recovery_in_use');}
 finally{release?.();sync?.dispose();await store?.discardAndClose();faults.clear();faults.restore();await f.close();}
});
test('revision verification also reads the base queue committed row, under its existing single reservation',async()=>{
 const f=await fixture({versions:false}),key=queueKey(f.identity);let read,original;
 try{const p=f.queue.propose('Base packet','1',draft('base-image'));await f.queue.flush();f.outbox.revise({previousSuggestionId:p.id,title:'Child',createdAtMs:'2',draft:draft('child-image')});await f.outbox.flush();read=await captureOriginalRevisionRecords(f.outbox,()=>{});await change(f.database,'suggestions',store=>{const q=store.get(key);q.onsuccess=()=>{original=q.result;store.put({...original,retained:[]},key);};});read.checkCurrent();await assert.rejects(read.verify());await change(f.database,'suggestions',store=>store.put(original,key));original=undefined;await read.verify();}
 finally{if(original)await change(f.database,'suggestions',store=>store.put(original,key));read?.dispose();await f.close();}
});
test('custom revision storage keeps old editing support but cannot supply managed read custody',async()=>{
 const f=await fixture({revisions:false,versions:false});let outbox;
 try{outbox=await api.SharedSuggestionRevisions.open({database:f.tag+'-custom-revisions',binding:'c'.repeat(64),queue:f.queue,storage:{core:f.source.core,save:()=>f.source.save(),flush:()=>f.source.flush()},transport:f.transport,autoStart:false});await assert.rejects(captureOriginalRevisionRecords(outbox,()=>{}),error=>error.code==='revision_record_read_family');const p=f.queue.propose('Ordinary custom base','1',draft('base-image'));await f.queue.flush();outbox.revise({previousSuggestionId:p.id,title:'Ordinary custom child',createdAtMs:'2',draft:draft('child-image')});await outbox.flush();}
 finally{await outbox?.discardAndClose();await f.close();}
});
test('a read of retained revision packets never reacquires document or review authors',async()=>{
 const f=await fixture({versions:false});let read;
 try{const p=f.queue.propose('Retained base','1',draft('base-image'));await f.queue.flush();f.outbox.revise({previousSuggestionId:p.id,title:'Retained child',createdAtMs:'2',draft:draft('child-image')});await f.outbox.flush();f.source.core.setReadOnly(true);f.source.core.setReviewAccess('read_only');await f.source.flush();const native=f.source.exportRecovery(),stores=await snapshotReadDatabases();read=await captureOriginalRevisionRecords(f.outbox,()=>{});read.checkCurrent();await read.verify();assert.equal(f.source.core.view().readOnly,true);assert.throws(()=>f.source.core.dispatchReview({kind:'create_thread',data:{anchorJson:f.source.core.captureReviewAnchor({kind:'document'}),body:'Denied'}}));assert.deepEqual(f.source.exportRecovery(),native);assert.deepEqual(await snapshotReadDatabases(),stores);}
 finally{read?.dispose();await f.close();}
});
test('atomic retained version/revision adapters require their complete driver, not original-store readers',async()=>{
 const f=await generationRecordFixture({api,profile,tag:'original-read-atomic-refusal',family:'retained'});let calls=0;
 try{await assert.rejects(captureOriginalVersionRecords(f.versions,()=>{calls++;}),error=>error.code==='version_record_read_family');await assert.rejects(captureOriginalRevisionRecords(f.revisions,()=>{calls++;}),error=>error.code==='revision_record_read_family');assert.equal(calls,0);}
 finally{await f.close();}
});
