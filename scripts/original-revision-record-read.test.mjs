/** One actual queue reservation protects the original outbox and its base rows. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {captureOriginalRevisionRecords as capture} from '../packages/breditor-collaboration/dist/suggestion_revisions/outbox.js';
import {borrowPersistentSuggestionRecords} from '../packages/breditor-collaboration/dist/suggestions/queue.js';
import {captureRecordedAssetReferences} from '../packages/breditor-collaboration/dist/asset_references_capture.js';
import {revisionKey} from '../packages/breditor-collaboration/dist/suggestion_revisions/database.js';
import {originalStoresFixture,imageDraft as draft} from './fixtures/original-record-read/session.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let profile,sequence=0;
before(async()=>{const native=await import('../target/promoted-shared-web/breditor_shared.js');await native.default({module_or_path:readFileSync(new URL('../target/promoted-shared-web/breditor_shared_bg.wasm',import.meta.url))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const fixture=(extra={})=>originalStoresFixture({api,profile,seed,tag:'original-revision-read-'+sequence++,versions:false,...extra});
async function saved(f){const p=f.queue.propose('Original base proposal','1',draft('proposal-only-image'));await f.queue.flush();const r=f.outbox.revise({previousSuggestionId:p.id,title:'Original child revision',createdAtMs:'2',draft:draft('revision-only-image')});await f.outbox.flush();f.outbox.stopRetrying(r.id);await f.outbox.flush();return{p,r};}
for(const scope of[0,1,2])for(const mask of[0,1,2,3,4,5,6,7])for(const mode of['abort','lost-ack'])test(`revision committed/pending/LIVE with one queue gate ${scope}/${mask}/${mode}`,async()=>{
 const f=await fixture({scope,mask}),faults=recoveryFaults();let read,stored,live;
 try{const {r}=await saved(f),original=f.outbox.exportRecovery(),queue=f.queue.exportRecovery();faults.select(f.tag+'-revisions','revisions',1,mode);f.outbox.forget(r.id);await assert.rejects(f.outbox.flush());faults.clear();const native=f.source.exportRecovery(),stores=await snapshotReadDatabases();live=api.captureSharedAssetReferences({core:f.source.core,suggestions:f.queue,revisions:f.outbox});assert.equal(live.metadata().outcome.kind,'ready');assert.equal(live.metadata().outcome.references.some(row=>row.asset==='revision-only-image'),false);read=await capture(f.outbox,()=>{});read.checkCurrent();await read.verify();const m=read.metadata();assert.deepEqual(m.committed,mode==='abort'?original:m.live);assert.equal(m.pending.retained.length,0);assert.equal(m.live.retained.length,0);assert.deepEqual(m.queue.committed,queue);assert.deepEqual(m.queue.live,queue);assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.committed.retained)&&Object.isFrozen(m.queue));stored=captureRecordedAssetReferences(f.source.core,[{kind:'suggestions',read:()=>m.queue.committed},{kind:'suggestion-revisions',read:()=>m.committed}],()=>read.check());assert.equal(stored.metadata().outcome.kind,'ready');assert.equal(stored.metadata().outcome.references.some(row=>row.asset==='revision-only-image'),mode==='abort');assert.throws(()=>f.queue.propose('No double owner','3',draft('raced-image')),error=>error.code==='suggestion_recovery_in_use');assert.throws(()=>f.outbox.revise({previousSuggestionId:m.queue.live.retained[0]?f.queue.proposals()[0].id:'missing',title:'Raced revision',createdAtMs:'4',draft:draft('raced-child')}),error=>error.code==='suggestion_recovery_in_use');await assert.rejects(borrowPersistentSuggestionRecords(f.queue,()=>{}),error=>error.code==='suggestion_recovery_in_use');assert.deepEqual(f.source.exportRecovery(),native);assert.deepEqual(await snapshotReadDatabases(),stores);assert.equal(f.counts.networkCalls,0);stored.dispose();stored=undefined;read.dispose();read=undefined;await f.outbox.retry();}
 finally{stored?.dispose();live?.dispose();read?.dispose();faults.clear();faults.restore();await f.close();}
});
test('revision record reads use fresh read permission without invoking an expired transport guard',async()=>{
 const f=await fixture();let read,guardCalls=0,readyCalls=0;const check=f.transport.checkSuggestionRevisions,ready=f.transport.suggestionRevisionsReady;
 try{await saved(f);await new Promise(resolve=>setImmediate(resolve));f.transport.checkSuggestionRevisions=()=>{guardCalls++;throw Error('Old transport authority expired');};f.transport.suggestionRevisionsReady=()=>{readyCalls++;throw Error('No transport probe');};read=await capture(f.outbox,()=>{});read.check();read.checkCurrent();await read.verify();assert.equal(guardCalls,0);assert.equal(readyCalls,0);assert.equal(f.counts.networkCalls,0);}
 finally{f.transport.checkSuggestionRevisions=check;f.transport.suggestionRevisionsReady=ready;read?.dispose();await f.close();}
});
test('revision verification rereads both actual original rows and refuses missing/corrupt records',async()=>{
 const f=await fixture(),key=revisionKey(f.identity,'c'.repeat(64));let read,original;
 try{await saved(f);read=await capture(f.outbox,()=>{});await change(f.tag+'-revisions','revisions',store=>{const q=store.get(key);q.onsuccess=()=>{original=q.result;store.put({...original,retained:[]},key);};});read.checkCurrent();await assert.rejects(read.verify());await change(f.tag+'-revisions','revisions',store=>store.put(original,key));await read.verify();await change(f.tag+'-revisions','revisions',store=>store.delete(key));const stores=await snapshotReadDatabases();await assert.rejects(read.verify());read.dispose();read=undefined;await assert.rejects(capture(f.outbox,()=>{}),error=>error.code==='revision_record_read_missing');assert.deepEqual(await snapshotReadDatabases(),stores);await change(f.tag+'-revisions','revisions',store=>store.put(original,key));original=undefined;read=await capture(f.outbox,()=>{});await read.verify();}
 finally{if(original)await change(f.tag+'-revisions','revisions',store=>store.put(original,key));read?.dispose();await f.close();}
});
test('revision read permission, cancellation and retained metadata have separate lifetimes',async()=>{
 const f=await fixture();let read,allowed=true,calls=0;
 try{await saved(f);const abort=new AbortController();read=await capture(f.outbox,()=>{calls++;if(!allowed)throw Error('Read ended');},abort.signal);const count=calls;read.checkCurrent();assert.equal(calls,count);allowed=false;assert.throws(()=>read.check());allowed=true;await read.verify();abort.abort();assert.throws(()=>read.checkCurrent());const metadata=read.metadata();read.dispose();read.dispose();assert.equal(read.metadata(),metadata);assert.throws(()=>read.check());await assert.rejects(read.verify());read=undefined;await f.source.discardAndClose();await assert.rejects(capture(f.outbox,()=>{}));}
 finally{read?.dispose();await f.close();}
});
test('invalid, late and reentrant revision read policies never orphan the shared queue gate',async()=>{
 const f=await fixture();let read,calls=0,at=Infinity,reenter=false;const guard=()=>{if(++calls===at)throw Error('Late read loss');if(reenter)read.check();};
 try{for(const value of[null,0,{},'read'])await assert.rejects(capture(f.outbox,value));read=await capture(f.outbox,guard);const total=calls;read.dispose();read=undefined;for(at of[1,2,3,4,...Array(9).fill(total)]){calls=0;await assert.rejects(capture(f.outbox,guard));const next=await capture(f.outbox,()=>{});next.dispose();}at=Infinity;read=await capture(f.outbox,guard);reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;await read.verify();await assert.rejects(f.outbox.close(),error=>error.code==='suggestion_recovery_in_use');read.dispose();read=undefined;f.queue.propose('Shared gate released','1',draft('after-read-image'));await f.queue.flush();}
 finally{at=Infinity;reenter=false;read?.dispose();await f.close();}
});
test('revision source brands and replaced core accessors refuse without evaluating getters',async()=>{
 let calls=0;const fake=Object.create(api.SharedSuggestionRevisions.prototype);Object.defineProperty(fake,'core',{get(){calls++;throw Error('Fake');}});await assert.rejects(capture(fake,()=>{}),error=>error.code==='revision_record_read_source');const f=await fixture(),own=Object.getOwnPropertyDescriptor(f.source,'core');let read;
 try{read=await capture(f.outbox,()=>{});Object.defineProperty(f.source,'core',{configurable:true,get(){calls++;throw Error('Replacement');}});assert.throws(()=>read.checkCurrent());assert.equal(calls,0);}finally{Object.defineProperty(f.source,'core',own);read?.dispose();await f.close();}
});
test('active revision writes refuse discovery rather than flushing or waiting for a producer',async()=>{
 const f=await fixture();let read;
 try{const p=f.queue.propose('Base','1',draft('base-image'));await f.queue.flush();f.outbox.revise({previousSuggestionId:p.id,title:'In flight',createdAtMs:'2',draft:draft('child-image')});await assert.rejects(capture(f.outbox,()=>{}),error=>error.code==='suggestion_recovery_in_use');await f.outbox.flush();read=await capture(f.outbox,()=>{});await read.verify();}
 finally{read?.dispose();await f.close();}
});
