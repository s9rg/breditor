/** Actual original paired native rows; no save/replay/author acquisition by a read. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {capturePersistentPairedRecords as capture} from '../packages/breditor-collaboration/dist/persistence/review_session.js';
import {originalQueueFixture} from './fixtures/persistent-suggestion-read/session.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url),seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let profile,sequence=0;
before(async()=>{const native=await import(pathToFileURL(runtime.pathname+'breditor_shared.js'));await native.default({module_or_path:readFileSync(new URL('breditor_shared_bg.wasm',runtime))});profile=nativeProfile(native,3,true);});after(()=>profile?.free());
const fixture=(extra={})=>originalQueueFixture({api,profile,seed,tag:'original-paired-read-'+sequence++,...extra});
for(const scope of[0,1,2])for(const mask of[0,2,4,6])for(const mode of['abort','lost-ack'])test(`original paired committed/pending/LIVE scope=${scope}/mask=${mask}/save=${mode}`,async()=>{
 const f=await fixture({scope,mask}),faults=recoveryFaults(),source=f.source,save=Object.getOwnPropertyDescriptor(source,'save');let read;
 try{const original=source.exportRecovery();faults.select(f.tag+'-source','journals',1,mode);insertCleanupText(source.core,'Pending original document ');await assert.rejects(source.flush());faults.clear();const pending=source.exportRecovery();Object.defineProperty(source,'save',{configurable:true,value(){}});insertCleanupText(source.core,'Unsaved original LIVE ');source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Unsaved paired comment'}});source.saveVersion('Unsaved paired version','2');const live=source.exportRecovery(),stores=await snapshotReadDatabases();read=await capture(source,()=>{});read.check();await read.verify();read.checkCurrent();const metadata=read.metadata();assert.equal(metadata.scope,'original-paired-committed-pending-live');assert.deepEqual(metadata.committed,mode==='abort'?original:pending);assert.deepEqual(metadata.pending,pending);assert.deepEqual(metadata.live,live);assert.equal(metadata.live.versions.length,pending.versions.length+1);assert.deepEqual(source.exportRecovery(),live);assert.deepEqual(await snapshotReadDatabases(),stores);assert.ok(Object.isFrozen(metadata)&&Object.isFrozen(metadata.live)&&Object.isFrozen(metadata.live.versions));
  if(save)Object.defineProperty(source,'save',save);else delete source.save;await source.retry();assert.deepEqual(source.exportRecovery(),live);assert.throws(()=>read.checkCurrent(),error=>error.code==='paired_record_read_changed');await assert.rejects(read.verify());read.dispose();read=undefined;assert.equal(source.core.undo(),true);assert.equal(source.core.redo(),true);assert.equal(source.core.undoReview().kind,'committed');assert.equal(source.core.redoReview().kind,'committed');
 }finally{if(save)Object.defineProperty(source,'save',save);else delete source.save;read?.dispose();faults.clear();faults.restore();await f.close();}
});
test('paired LIVE reads canonical native methods, not replacement public checkpoint hooks',async()=>{
 const f=await fixture(),core=f.source.core,document=Object.getOwnPropertyDescriptor(core,'checkpointJson'),review=Object.getOwnPropertyDescriptor(core,'reviewCheckpoint');let read,calls=0;
 try{const expected=f.source.exportRecovery();core.checkpointJson=()=>{calls++;throw Error('Do not invoke');};core.reviewCheckpoint=()=>{calls++;throw Error('Do not invoke');};read=await capture(f.source,()=>{});read.checkCurrent();assert.deepEqual(read.metadata().live,expected);assert.equal(calls,0);}finally{if(document)Object.defineProperty(core,'checkpointJson',document);else delete core.checkpointJson;if(review)Object.defineProperty(core,'reviewCheckpoint',review);else delete core.reviewCheckpoint;read?.dispose();await f.close();}
});
for(const lane of['document','review'])test(`paired read observes ${lane} changes even when public autosave is suppressed`,async()=>{
 const f=await fixture(),save=Object.getOwnPropertyDescriptor(f.source,'save');let read;
 try{read=await capture(f.source,()=>{});Object.defineProperty(f.source,'save',{configurable:true,value(){}});if(lane==='document')insertCleanupText(f.source.core,'No autosave but new native document ');else f.source.core.dispatchReview({kind:'create_thread',data:{anchorJson:f.source.core.captureReviewAnchor({kind:'document'}),body:'No autosave but new comment'}});assert.throws(()=>read.checkCurrent(),error=>error.code==='paired_record_read_changed');await assert.rejects(read.verify());}finally{if(save)Object.defineProperty(f.source,'save',save);else delete f.source.save;read?.dispose();await f.close();}
});
test('paired read authority, cancellation and closure are distinct from detached record metadata',async()=>{
 const f=await fixture();let read,allowed=true,calls=0;
 try{const abort=new AbortController();read=await capture(f.source,()=>{calls++;if(!allowed)throw Error('Read expired');},abort.signal);const count=calls;read.checkCurrent();assert.equal(calls,count);allowed=false;assert.throws(()=>read.check());allowed=true;await read.verify();abort.abort();assert.throws(()=>read.checkCurrent());const metadata=read.metadata();await f.source.discardAndClose();assert.throws(()=>read.checkCurrent());read.dispose();read.dispose();assert.equal(read.metadata(),metadata);await assert.rejects(read.verify());}finally{read?.dispose();await f.close();}
});
test('paired durable verification rejects actual changed rows and never trusts a current managed epoch',async()=>{
 const f=await fixture();let read,original;
 try{f.source.saveVersion('Actually saved version','1');await f.source.flush();read=await capture(f.source,()=>{});assert.equal(read.metadata().committed.versions.length,1);await change(f.tag+'-source','journals',store=>{const q=store.get(['room','101']);q.onsuccess=()=>{original=q.result;store.put({...original,versions:[]},['room','101']);};});read.checkCurrent();await assert.rejects(read.verify());await change(f.tag+'-source','journals',store=>store.put(original,['room','101']));await read.verify();await change(f.tag+'-source','journals',store=>store.delete(['room','101']));read.checkCurrent();await assert.rejects(read.verify());await change(f.tag+'-source','journals',store=>store.put(original,['room','101']));original=undefined;await read.verify();}finally{if(original)await change(f.tag+'-source','journals',store=>store.put(original,['room','101']));read?.dispose();await f.close();}
});
test('paired read refuses source lookalikes and does not evaluate replacement core accessors',async()=>{
 let calls=0;const fake=Object.create(api.SharedReviewPersistentSession.prototype);Object.defineProperty(fake,'core',{get(){calls++;throw Error('Fake');}});await assert.rejects(capture(fake,()=>{}),error=>error.code==='paired_record_read_source');assert.equal(calls,0);const f=await fixture(),core=Object.getOwnPropertyDescriptor(f.source,'core');let read;
 try{read=await capture(f.source,()=>{});Object.defineProperty(f.source,'core',{configurable:true,get(){calls++;throw Error('Replacement');}});assert.throws(()=>read.checkCurrent());assert.equal(calls,0);}finally{Object.defineProperty(f.source,'core',core);read?.dispose();await f.close();}
});
test('failed or reentrant paired read policies release every temporary read permit',async()=>{
 const f=await fixture();let read,calls=0,at=Infinity,reenter=false;const guard=()=>{if(++calls===at)throw Error('Read revoked');if(reenter)read.check();};
 try{for(const value of[null,0,{},'read'])await assert.rejects(capture(f.source,value));read=await capture(f.source,guard);const total=calls;read.dispose();read=undefined;for(at of[1,2,3,4,...Array(9).fill(total)]){calls=0;await assert.rejects(capture(f.source,guard));const next=await capture(f.source,()=>{});next.dispose();}at=Infinity;read=await capture(f.source,guard);reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;read.check();await read.verify();}finally{at=Infinity;reenter=false;read?.dispose();await f.close();}
});
test('paired readers have a separate bounded lifetime and disposal never closes the source',async()=>{
 const f=await fixture(),reads=[];let calls=0;
 try{for(let i=0;i<8;i++)reads.push(await capture(f.source,()=>{}));await assert.rejects(capture(f.source,()=>{calls++;}),error=>error.code==='paired_record_read_busy');assert.equal(calls,0);reads[0].dispose();reads.push(await capture(f.source,()=>{}));for(const read of reads)read.dispose();insertCleanupText(f.source.core,'Still editable after read disposal ');await f.source.flush();}finally{for(const read of reads)read.dispose();await f.close();}
});
for(const[mask,relay,format]of[[0,'author','breditor/shared-review-relay-checkpoint-record'],[0,'observer','breditor/shared-review-observer-checkpoint-record'],[2,'author','breditor/shared-reviewed-review-checkpoint-record'],[4,'author','breditor/shared-search-review-checkpoint-record'],[6,'observer','breditor/shared-search-review-checkpoint-record']])test(`paired reader preserves actual stored family mask=${mask}/relay=${relay}`,async()=>{
 const f=await fixture({scope:2,mask,relay});let read;
 try{const expected=f.source.exportRecovery();read=await capture(f.source,()=>{});assert.equal(read.metadata().committed.format,format);assert.deepEqual(read.metadata().committed,expected);assert.deepEqual(read.metadata().live,expected);f.source.state();await f.source.flush();read.checkCurrent();await read.verify();if(relay==='observer')assert.equal(f.source.core.localReviewClock().through,'0');}finally{read?.dispose();await f.close();}
});
