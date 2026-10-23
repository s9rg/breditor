/** Independent reader context preserves both ORIGINAL and newer input-LIVE
 * ancestry. A valid old original must not masquerade as current graph state. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentDeliveryParticipant as OldParticipant} from '../packages/breditor-collaboration/dist/independent_operation/participant.js';
import {RestoredOperationParticipant as Participant} from '../packages/breditor-collaboration/dist/restored_participant/participant.js';
import {captureIndependentOperationBackup as captureOld} from '../packages/breditor-collaboration/dist/independent_operation/portable_capture.js';
import {captureRestoredGraph as capture} from '../packages/breditor-collaboration/dist/restored_graph/capture.js';
import {restoredGraphReaderOrigin} from '../packages/breditor-collaboration/dist/restored_graph/reader_origin.js';
import {portableReadPolicy} from '../packages/breditor-collaboration/dist/independent_operation/portable_policy.js';
import {prepareIndependentDeliveryRecovery} from '../packages/breditor-collaboration/dist/independent_delivery_recovery/prepare.js';
import {replayPortableRecovery} from '../packages/breditor-collaboration/dist/independent_operation/portable_replay.js';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {readerRuntimeGraphFixture} from './fixtures/restored-graph/reader-runtime.mjs';
import {attachDelivery} from './fixtures/independent-delivery/session.mjs';
import {secondAsset,secondPixel} from './fixtures/review-assets/pixels.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';
const runtime=new URL('../target/promoted-shared-web/',import.meta.url),seed=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url))),file=pathToFileURL(runtime.pathname+'breditor_shared.js').href,bytes=readFileSync(new URL('breditor_shared_bg.wasm',runtime));let pa,pb;
before(async()=>{const a=await import(file),b=await import(file+'?graph-reader-laws');await a.default({module_or_path:bytes});await b.default({module_or_path:bytes});assert.notEqual(a.SharedRichProfile,b.SharedRichProfile);pa=nativeProfile(a,3,true);pb=nativeProfile(b,3,true);});
after(()=>{pb?.free();pa?.free();});
for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const expired of [false,true])for(const kind of ['snapshot-v1','lineage-v1','lineage-v2'])test(`graph reader preserves input-LIVE and pending pixels, document=${documentSegmented}/review=${reviewSegmented}/write-expired=${expired}/input=${kind}`,{timeout:120000},async()=>{
 const tag='graph-reader-'+Number(documentSegmented)+Number(reviewSegmented)+Number(expired)+'-'+kind,generation='only-pending-'+tag;let f,owner,parts,same,other,prepared,origins,originalReplay,inputReplay,write=true;
 try{
  f=await readerRuntimeGraphFixture({api,rich,OldParticipant,Participant,captureOld,capture,profile:pa,seed,tag,selection:{documentSegmented,reviewSegmented}},kind);
  const options={...f.options,checkAuthority(){if(!write)throw Error('target writer expired');}};owner=await Participant.begin(f.input.file(),options);await owner.finish();parts=await owner.intoParts();const source=parts.source.session;
  insertCleanupText(source.core,'Retained graph Redo ');source.core.undo();await source.flush();const queues=await attachDelivery(api,source,f.selected.options);
  f.faults.select(options.sourceDatabase,'restored_operation_history_heads',1,'abort');const proposal=queues.queue.propose('Pending graph-only image','91',{scope:'commands',edit:{kind:'commands',data:[{kind:'replace_image',data:{block:'image-block',asset:secondAsset,generation}}]}});await assert.rejects(queues.queue.flush());f.faults.clear();queues.queue.stopRetryingPublication(proposal.id);queues.queue.forget(proposal.id);
  if(expired){write=false;await assert.rejects(source.flush());}
  const beforeDocument=source.core.checkpointJson(),beforeReview=reviewSegmented?source.core.reviewSegmentedCheckpoint():source.core.reviewCheckpoint(),beforeStores=await snapshotReadDatabases(),history=f.readOptions.session.documentHistory,restore=checkpoint=>documentSegmented?pb.restore_segmented('room',checkpoint):pb.restore('room',checkpoint),session={...f.readOptions.session,documentHistory:documentSegmented?{...history,restoreSegmented:restore}:{...history,restoreOriginal:restore}},readOptions={...f.readOptions,session};
  same=await capture({source,assets:parts.uploads,...f.readOptions});assert.equal(same.kind,'ready');other=await capture({source,assets:parts.uploads,...readOptions});assert.equal(other.kind,'ready');
  for(const result of [same,other]){assert.ok(result.archive.pendingCut());assert.equal(JSON.stringify(result.archive.liveSource().retained).includes(generation),false);assert.match(result.archive.pendingCut().head,new RegExp(generation));assert.deepEqual(Buffer.from(await result.archive.blob(secondAsset,generation).arrayBuffer()),Buffer.from(secondPixel));assert.deepEqual(Buffer.from(await(await result.archive.inputFile()).arrayBuffer()),Buffer.from(await f.input.file().arrayBuffer()));}
  // Both anchors are genuine reader-runtime replays. Newer input succeeds;
  // its valid historical original MUST refuse as a current-state replacement.
  const originalData=f.originalRecovery(),inputData=f.input.liveSource(),policy=portableReadPolicy(f.input.selection().original,readOptions);prepared=await prepareIndependentDeliveryRecovery(policy,f.input.originalFile());origins=await restoredGraphReaderOrigin({kind,owner:f.input},originalData,prepared.factory,()=>{});originalReplay=await replayPortableRecovery(prepared.factory,originalData,()=>{});inputReplay=await replayPortableRecovery(prepared.factory,inputData,()=>{});
  origins.verify(inputReplay.core,inputData.source.versions);assert.throws(()=>origins.verify(originalReplay.core,originalData.source.versions),'The newer imported LIVE anchor cannot be dropped');origins.dispose();origins=undefined;originalReplay.dispose();originalReplay=undefined;inputReplay.dispose();inputReplay=undefined;prepared.backup.dispose();prepared=undefined;
  assert.equal(source.core.checkpointJson(),beforeDocument);assert.equal(reviewSegmented?source.core.reviewSegmentedCheckpoint():source.core.reviewCheckpoint(),beforeReview);assert.deepEqual(await snapshotReadDatabases(),beforeStores);write=true;assert.equal(source.core.redo(),true);assert.equal(source.core.undo(),true);
 }finally{write=true;f?.faults.clear();origins?.dispose();originalReplay?.dispose();inputReplay?.dispose();prepared?.backup.dispose();if(other?.kind==='ready')other.archive.dispose();if(same?.kind==='ready')same.archive.dispose();await parts?.source.session.discardAndClose();parts?.uploads.close();await owner?.discardAndClose();await f?.close();}
});
