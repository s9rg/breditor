/** Development-only independently selected same-byte reader runtime. Every
 * comparison stays within its own native instance; source work stays intact. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentDeliveryParticipant as Participant} from '../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {captureIndependentOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile} from './fixtures/owned-core-cleanup/session.mjs';
import {portableFixture} from './fixtures/independent-operation/portable.mjs';
import {recoveryFaults} from './fixtures/independent-delivery-recovery/storage.mjs';
import {secondAsset,secondPixel} from './fixtures/review-assets/pixels.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url),seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url))),file=pathToFileURL(runtime.pathname+'breditor_shared.js').href,bytes=readFileSync(new URL('breditor_shared_bg.wasm',runtime));let pa,pb;
before(async()=>{const a=await import(file),b=await import(file+'?independent-reader-laws');await a.default({module_or_path:bytes});await b.default({module_or_path:bytes});assert.notEqual(a.SharedRichProfile,b.SharedRichProfile);pa=nativeProfile(a,3,true);pb=nativeProfile(b,3,true);});
after(()=>{pb?.free();pa?.free();});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const expired of [false,true])test(`independent reader keeps pending-only pixels and native work, document=${documentSegmented}/review=${reviewSegmented}/write-expired=${expired}`,async()=>{
 const reset=environment(),faults=recoveryFaults(),tag='reader-runtime-'+Number(documentSegmented)+Number(reviewSegmented)+Number(expired),generation='pending-only-'+tag;let f,same,other;
 try{
  f=await portableFixture({api,rich,Participant,profile:pa,seed,tag,selection:{documentSegmented,reviewSegmented}});
  faults.select(f.options.sourceDatabase,'operation_history_heads',1,'abort');
  const proposal=f.queues.queue.propose('Pending-only reader image','9',{scope:'commands',edit:{kind:'commands',data:[{kind:'replace_image',data:{block:'image-block',asset:secondAsset,generation}}]}});
  await assert.rejects(f.queues.queue.flush());faults.clear();f.queues.queue.stopRetryingPublication(proposal.id);f.queues.queue.forget(proposal.id);
  if(expired){f.setWrite(false);await assert.rejects(f.source.flush());}
  const beforeDocument=f.source.core.checkpointJson(),beforeReview=reviewSegmented?f.source.core.reviewSegmentedCheckpoint():f.source.core.reviewCheckpoint(),beforeStores=await snapshotReadDatabases();
  same=await capture({source:f.source,assets:f.uploads,...f.readOptions});assert.equal(same.kind,'ready');
  const history=f.readOptions.session.documentHistory,restore=checkpoint=>documentSegmented?pb.restore_segmented('room',checkpoint):pb.restore('room',checkpoint),session={...f.readOptions.session,documentHistory:documentSegmented?{...history,restoreSegmented:restore}:{...history,restoreOriginal:restore}};
  other=await capture({source:f.source,assets:f.uploads,...f.readOptions,session});assert.equal(other.kind,'ready');
  for(const result of [same,other]){assert.ok(result.backup.pendingCut());assert.equal(JSON.stringify(result.backup.liveSource().retained).includes(generation),false);assert.match(result.backup.pendingCut().head,new RegExp(generation));assert.ok(result.backup.metadata().bindings.some(row=>row.asset===secondAsset&&row.generation===generation));assert.deepEqual(Buffer.from(await result.backup.blob(secondAsset,generation).arrayBuffer()),Buffer.from(secondPixel));assert.deepEqual(Buffer.from(await result.backup.originalFile().arrayBuffer()),Buffer.from(await f.backup.file().arrayBuffer()));}
  assert.deepEqual(other.backup.liveSource(),same.backup.liveSource());assert.equal(f.source.core.checkpointJson(),beforeDocument);assert.equal(reviewSegmented?f.source.core.reviewSegmentedCheckpoint():f.source.core.reviewCheckpoint(),beforeReview);assert.deepEqual(await snapshotReadDatabases(),beforeStores);
  f.setWrite(true);assert.equal(f.source.core.redo(),true);assert.equal(f.source.core.undo(),true);assert.equal(f.source.core.redoReview().kind,'committed');assert.equal(f.source.core.undoReview().kind,'committed');
 }finally{faults.restore();if(other?.kind==='ready')other.backup.dispose();if(same?.kind==='ready')same.backup.dispose();await f?.close();reset();}
});
