/** Exercise both native continuation lanes through the ordinary SDK and exact public Wasm. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SharedRichEditor} from '../packages/breditor-collaboration/dist/index.js';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const author={actor:'review-a',principal:'alice',access:'comment'};
const peerPolicy={actor:'review-b',principal:'bob',access:'comment'};
const readOnly={...author,access:'read_only'};

export async function probeContinuedReviewSdk(directory){
 const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm'));
 const native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);
 await native.default({module_or_path:bytes});
 const profile=native.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({
  format:'breditor/shared-rich-profile',formatVersion:3,schema:{name:'example/continued-comment-sdk',version:1},extensions:[],
 }));
 const descriptor=JSON.parse(profile.descriptor_json());
 const input=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
 const counts={documentFamilies:0,coldReopens:0,exactPredecessors:0,offlineReceipts:0,futureHistoryComparisons:0};
 try{
  for(const family of ['original','segmented-v1','continued-v2']){
   const owners=[];
   function own(raw){
    const core=new SharedRichEditor(raw,family==='original'?{}:{segmentedHistory:family});
    owners.push(core);
    return core;
   }
   function reopen(document){
    const raw=family==='original'?profile.restore('room',document):family==='segmented-v1'
     ?profile.restore_segmented('room',document):profile.restore_continued_history('room',document);
    return own(raw);
   }
   try{
    const raw=profile.create(input,'101');
    if(family!=='original'){
     const initial=raw.observe();
     try{raw.enable_segmented_history(initial,'doc-root','doc-first');}finally{initial.free();}
    }
    if(family==='continued-v2'){
     const segmented=raw.observe();
     try{raw.continue_history(segmented,'doc-continued');}finally{segmented.free();}
    }
    const current=own(raw);
    const peer=new SharedRichEditor(profile.join_frame('room','202',current.updateFrame()));
    owners.push(peer);
    current.enableReview(author);
    peer.enableReview(peerPolicy);
    assert.equal(current.supportsContinuedReviewHistory(),true);
    const anchor=current.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'image-block'}});
    const created=current.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Exact original comment'}});
    assert.equal(created.kind,'committed');
    peer.receiveReview(current.exportReview(),author);
    current.enableReviewHistoryGenerations('comment-root','comment-first');
    current.dispatchReview({kind:'reply',data:{thread:created.event,body:'Retained local Redo'}});
    current.sealReviewHistoryGeneration('comment-second');
    current.undoReview();
    const document=current.checkpointJson(), predecessor=current.reviewSegmentedCheckpoint();
    const clock=current.localReviewClock(), stale=current.reviewSnapshot();
    assert.throws(()=>current.continueReviewHistory('comment-first'));
    assert.throws(()=>current.continueReadOnlyReviewHistory('continued'));
    assert.equal(current.reviewSegmentedCheckpoint(),predecessor);
    assert.deepEqual(current.reviewSnapshot(),stale);
    const legacy=reopen(document);
    legacy.enableSegmentedReview(author,predecessor);
    if(family!=='continued-v2'){
     legacy.sealIndependentHistoryPolicies(family,'segmented-v1','explicit','original');
     assert.throws(()=>legacy.continueReviewHistory('pinned'),error=>error.code==='review_generation_storage_required');
    }
    current.continueReviewHistory('comment-continued',stale);
    assert.equal(current.reviewHistoryPolicy(),'continued-v2');
    assert.deepEqual(current.localReviewClock(),clock);
    assert.equal(current.checkpointJson(),document);
    assert.throws(()=>current.reviewContinuedCheckpoint(stale),error=>error.code==='stale_review');
    assert.throws(()=>current.reviewSegmentedCheckpoint());
    assert.throws(()=>current.reviewCheckpoint());
    assert.throws(()=>current.continueReviewHistory('again'));
    const selected=JSON.parse(current.reviewContinuedCheckpoint()),prior=JSON.parse(predecessor);
    assert.equal(selected.continuedAfter,prior.sealed.length+1);
    assert.equal(selected.root,prior.root);
    assert.deepEqual(selected.sealed,[...prior.sealed,prior.active]);
    counts.exactPredecessors++;
    const lockedFromV1=reopen(document);
    lockedFromV1.enableSegmentedReview(readOnly,predecessor);
    lockedFromV1.continueReadOnlyReviewHistory('comment-continued');
    assert.equal(lockedFromV1.reviewContinuedCheckpoint(),current.reviewContinuedCheckpoint());
    assert.throws(()=>lockedFromV1.redoReview());
    peer.dispatchReview({kind:'reply',data:{thread:created.event,body:'Offline comment from the original protocol'}});
    const offline=peer.exportReview();
    assert.equal(current.receiveReview(offline,peerPolicy).kind,'applied');
    const receipt=current.retainedReviewReceipt(offline,peerPolicy);
    current.sealReviewHistoryGeneration('after-offline');
    const archive=current.reviewContinuedCheckpoint();
    const cold=reopen(document);
    assert.throws(()=>cold.enableContinuedReview(author,predecessor));
    assert.throws(()=>cold.enableSegmentedReview(author,archive));
    assert.equal(cold.reviewHistoryPolicy(),null);
    cold.enableContinuedReview(author,archive);
    assert.equal(cold.reviewContinuedCheckpoint(),archive);
    assert.deepEqual(cold.retainedReviewReceipt(offline,peerPolicy),receipt);
    counts.offlineReceipts++;
    if(family==='original')cold.verifyRecoveryOrigin(legacy);
    else cold.verifySegmentedRecoveryOrigin(legacy);
    for(const action of ['redoReview','undoReview','redoReview']){
     assert.deepEqual(cold[action](),current[action]());
     assert.equal(cold.reviewContinuedCheckpoint(),current.reviewContinuedCheckpoint());
     assert.equal(cold.checkpointJson(),document);
     assert.equal(current.checkpointJson(),document);
     counts.futureHistoryComparisons++;
    }
    const locked=reopen(document);
    locked.enableContinuedReview(readOnly,archive);
    assert.throws(()=>locked.undoReview());
    assert.equal(locked.reviewContinuedCheckpoint(),archive);
    assert.throws(()=>locked.sealReviewPolicies('explicit','original'),error=>error.code==='review_generation_storage_required');
    assert.throws(()=>locked.sealIndependentHistoryPolicies(family,'continued-v2','explicit','original'),error=>error.code==='independent_history_policy');
    counts.coldReopens+=2;
    counts.documentFamilies++;
   }finally{for(const core of owners.reverse())core.dispose();}
  }
 }finally{profile.free();}
 assert.deepEqual(counts,{documentFamilies:3,coldReopens:6,exactPredecessors:3,offlineReceipts:3,futureHistoryComparisons:9});
 return{passed:true,...counts,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex')};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3)throw Error('Require an explicitly built application runtime');
 console.log(JSON.stringify(await probeContinuedReviewSdk(process.argv[2]),null,2));
}
