/** Reference discovery needs no raster store and includes the real pending cut.
 * Persistent retry epochs are independent of native LIVE revision stamps. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentDeliveryParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {captureIndependentOperationBackup as captureBackup} from '../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import {IndependentOperationReferenceCapture as Capture,captureIndependentOperationReferences as capture} from '../packages/breditor-collaboration/dist/independent_operation/reference_capture.js';
import {independentDeliverySource} from '../packages/breditor-collaboration/dist/independent_delivery_source/admission.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {portableFixture} from './fixtures/independent-operation/portable.mjs';
import {recoveryFaults,change} from './fixtures/independent-delivery-recovery/storage.mjs';
import {secondAsset} from './fixtures/review-assets/pixels.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url),file=pathToFileURL(runtime.pathname+'breditor_shared.js').href,bytes=readFileSync(new URL('breditor_shared_bg.wasm',runtime)),seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)));let pa,pb;
before(async()=>{const a=await import(file),b=await import(file+'?reference-reader-laws');await a.default({module_or_path:bytes});await b.default({module_or_path:bytes});pa=nativeProfile(a,3,true);pb=nativeProfile(b,3,true);assert.notEqual(a.SharedRichProfile,b.SharedRichProfile);});after(()=>{pb?.free();pa?.free();});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const separate of [false,true])for(const expired of [false,true])test(`native packet discovery without pixels, document=${documentSegmented}/review=${reviewSegmented}/reader=${separate}/expired=${expired}`,async()=>{
 const reset=environment(),faults=recoveryFaults(),tag='reference-'+Number(documentSegmented)+Number(reviewSegmented)+Number(separate)+Number(expired),generation='retired-pending-'+tag;let f,empty,read;
 try{
  f=await portableFixture({api,rich,Participant,profile:pa,seed,tag,selection:{documentSegmented,reviewSegmented}});
  faults.select(f.options.sourceDatabase,'operation_history_heads',1,'abort');const proposal=f.queues.queue.propose('Only pending image','9',{scope:'commands',edit:{kind:'commands',data:[{kind:'replace_image',data:{block:'image-block',asset:secondAsset,generation}}]}});await assert.rejects(f.queues.queue.flush());faults.clear();f.queues.queue.stopRetryingPublication(proposal.id);f.queues.queue.forget(proposal.id);
  if(expired){f.setWrite(false);await assert.rejects(f.source.flush());}
  const history=f.readOptions.session.documentHistory,restore=checkpoint=>documentSegmented?pb.restore_segmented('room',checkpoint):pb.restore('room',checkpoint),session=separate?{...f.readOptions.session,documentHistory:documentSegmented?{...history,restoreSegmented:restore}:{...history,restoreOriginal:restore}}:f.readOptions.session;
  empty=await rich.RichAssetStore.open(tag+'-empty-uploads');
  const withoutBytes=await captureBackup({source:f.source,assets:empty,...f.readOptions,session});assert.equal(withoutBytes.kind,'pending');assert.ok(JSON.stringify(withoutBytes.pending).includes(secondAsset));
  const document=f.source.core.checkpointJson(),review=reviewSegmented?f.source.core.reviewSegmentedCheckpoint():f.source.core.reviewCheckpoint(),stores=await snapshotReadDatabases();
  read=await capture({source:f.source,...f.readOptions,session});read.check();await read.verify();read.checkCurrent();const metadata=read.metadata(),pending=metadata.states.find(row=>row.slot==='pending'),live=metadata.states.find(row=>row.slot==='live');assert.equal(metadata.kind,'ready');assert.ok(metadata.references.some(row=>row.asset===secondAsset&&row.generation===generation));assert.ok(pending.references.some(row=>row.asset===secondAsset&&row.generation===generation));assert.equal(live.references.some(row=>row.generation===generation),false);assert.ok(metadata.states.some(row=>row.slot==='original'));assert.ok(metadata.states.some(row=>row.slot==='current'));assert.ok(Object.isFrozen(metadata)&&Object.isFrozen(metadata.states)&&Object.isFrozen(metadata.references));assert.throws(()=>metadata.references.push({asset:'forged',generation:'forged'}));assert.throws(()=>Capture.prototype.check.call(metadata));
  assert.equal(f.source.core.checkpointJson(),document);assert.equal(reviewSegmented?f.source.core.reviewSegmentedCheckpoint():f.source.core.reviewCheckpoint(),review);assert.deepEqual(await snapshotReadDatabases(),stores);
  // The pending source commit can finish while native text/comments remain exact.
  // A retained-intent pin, not a native revision alone, must invalidate the read.
  const port=independentDeliverySource(f.source),stamps=port.stamp();f.setWrite(true);await f.source.retry();assert.equal(f.source.core.checkpointJson(),document);assert.equal(reviewSegmented?f.source.core.reviewSegmentedCheckpoint():f.source.core.reviewCheckpoint(),review);for(const[index,stamp]of stamps.entries())assert.equal(port.stamp()[index],stamp,'Retry changes the journal without changing the native/companion stamp');assert.throws(()=>read.check(),error=>error.code==='independent_operation_reference_changed');assert.throws(()=>read.checkCurrent(),error=>error.code==='independent_operation_reference_changed');await assert.rejects(read.verify(),error=>error.code==='independent_operation_reference_changed');
  const detached=metadata;read.dispose();read.dispose();assert.throws(()=>read.check(),error=>error.code==='independent_operation_reference_closed');assert.equal(read.metadata(),detached);read=undefined;
  assert.equal(f.source.core.redo(),true);assert.equal(f.source.core.undo(),true);assert.equal(f.source.core.redoReview().kind,'committed');assert.equal(f.source.core.undoReview().kind,'committed');
 }finally{faults.clear();read?.dispose();empty?.close();await f?.close();faults.restore();reset();}
});
test('reference lifetime observes independent cancellation and holds real journal cleanup',async()=>{
 const reset=environment();let f,read,closed=false;
 try{f=await portableFixture({api,rich,Participant,profile:pa,seed,tag:'reference-lifetime'});const abort=new AbortController();read=await capture({source:f.source,...f.readOptions,signal:abort.signal});abort.abort();assert.throws(()=>read.check());const closing=f.source.discardAndClose().then(()=>{closed=true;});await new Promise(resolve=>setTimeout(resolve,20));assert.equal(closed,false);read.dispose();read=undefined;await closing;assert.equal(closed,true);}
 finally{read?.dispose();await f?.close();reset();}
});
test('reference policies reject source accessors before invoking them',async()=>{
 let reads=0;await assert.rejects(capture({get source(){reads++;throw Error('source getter');},session:{},checkAuthority(){}}),error=>error.code==='independent_operation_reference_policy');assert.equal(reads,0);
});
test('late read-authority failures release every unreturned journal borrow',{timeout:60000},async()=>{
 const reset=environment();let f,read,calls=0,at=Infinity;
 const checkAuthority=()=>{calls++;if(calls===at)throw Error('late read revocation');};
 try{f=await portableFixture({api,rich,Participant,profile:pa,seed,tag:'reference-late-authority'});read=await capture({source:f.source,...f.readOptions,checkAuthority});const total=calls;read.dispose();read=undefined;assert.ok(total>10);
  for(at=total-9;at<=total;at++){calls=0;await assert.rejects(capture({source:f.source,...f.readOptions,checkAuthority}));const next=await capture({source:f.source,...f.readOptions});next.check();next.dispose();}
  assert.equal(f.source.core.redo(),true);assert.equal(f.source.core.undo(),true);
 }finally{at=Infinity;read?.dispose();await f?.close();reset();}
});
test('read revocation does not grant writes or prevent explicit proof disposal',async()=>{
 const reset=environment();let f,read;
 try{f=await portableFixture({api,rich,Participant,profile:pa,seed,tag:'reference-read-revocation'});f.setWrite(false);read=await capture({source:f.source,...f.readOptions});read.check();f.setRead(false);assert.throws(()=>read.check());read.dispose();read=undefined;f.setRead(true);const next=await capture({source:f.source,...f.readOptions});next.dispose();await assert.rejects(f.source.flush());f.setWrite(true);assert.equal(f.source.core.redo(),true);}
 finally{read?.dispose();await f?.close();reset();}
});
test('durable verification re-admits actual bytes rather than trusting a live epoch',async()=>{
 const reset=environment();let f,read,original;
 try{f=await portableFixture({api,rich,Participant,profile:pa,seed,tag:'reference-durable-check'});read=await capture({source:f.source,...f.readOptions});await read.verify();await change(f.options.database,'operation_original',store=>{const q=store.get('participant');q.onsuccess=()=>{original=q.result;store.put(new Blob(['different retained bytes']),'participant');};});read.checkCurrent();await assert.rejects(read.verify());await change(f.options.database,'operation_original',store=>store.put(original,'participant'));original=undefined;await read.verify();}
 finally{if(original)await change(f.options.database,'operation_original',store=>store.put(original,'participant'));read?.dispose();await f?.close();reset();}
});
test('reentrant read authority refuses without corrupting the genuine proof',async()=>{
 const reset=environment();let f,read,reenter=false;
 try{f=await portableFixture({api,rich,Participant,profile:pa,seed,tag:'reference-reentry'});read=await capture({source:f.source,...f.readOptions,checkAuthority(){if(reenter)read.check();}});reenter=true;assert.throws(()=>read.check());await assert.rejects(read.verify());reenter=false;read.check();await read.verify();read.checkCurrent();}
 finally{reenter=false;read?.dispose();await f?.close();reset();}
});
