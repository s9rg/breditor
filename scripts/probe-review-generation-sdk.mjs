/** Real native review families through the SDK; no durable-store support is implied here. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SharedRichEditor,createSharedDocumentEditor} from '../packages/breditor-collaboration/dist/index.js';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')));
const policy=access=>({actor:'review-a',principal:'alice',access}),peerPolicy={actor:'review-b',principal:'bob',access:'comment'};
const configure=(raw,scope,natural,segmented)=>{const options={...(segmented?{segmentedHistory:'segmented-v1'}:{})},core=scope===2?createSharedDocumentEditor(raw,options):new SharedRichEditor(raw,options);if(scope===1&&core.view().rangeEditing!=='general-v1')core.enableGeneralRanges();if(natural&&core.view().historyGrouping!=='typing-v1')core.enableTypingHistory();return core;};
function restore(profile,checkpoint,scope,natural,segmented){if(segmented)return profile.restore_segmented('room',checkpoint);if(scope===2)return natural?profile.restore_document_typing('room',checkpoint):profile.restore_document('room',checkpoint);if(scope===1)return natural?profile.restore_general_typing('room',checkpoint):profile.restore_general('room',checkpoint);return natural?profile.restore_typing('room',checkpoint):profile.restore('room',checkpoint);}
export async function probeReviewGenerationSdk(directory){
 const bytes=readFileSync(resolve(directory,'breditor_shared_bg.wasm')),native=await import(pathToFileURL(resolve(directory,'breditor_shared.js')).href);await native.default({module_or_path:bytes});
 const counts={cases:0,independentDocumentFamilies:0,coldPairs:0,futureHistoryPairs:0,staleGuardRefusals:0,foreignGuardRefusals:0,originalGetterRefusals:0,pinnedStoreRefusals:0,strictObserverRefusals:0,readOnlyBoundaries:0,exactFiles:0,pairedNativeOrigins:0};
 for(const language of [1,2,3])for(const standard of [false,true]){
  const configuration=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema:{name:'example/review-generation-sdk',version:1},extensions:[]}),constructor=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?`from_standard_configuration_json_v${language}`:`from_configuration_json_v${language}`),profile=native.SharedRichProfile[constructor](configuration),descriptor=JSON.parse(profile.descriptor_json()),input=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
  try{for(const scope of [0,1,2])for(const natural of [false,true])for(const segmented of [false,true]){
   let core,peer,cold,locked,unattached;
   try{
    core=configure(profile.create(input,'101'),scope,natural,false);if(segmented)core.enableSegmentedHistory('root','active');peer=configure(profile.join_frame('room','202',core.updateFrame()),0,false,false);peer.enableReview(peerPolicy);
    assert.equal(core.supportsReviewHistoryGenerations(),true);assert.equal(core.reviewHistoryPolicy(),null);core.enableReview(policy('comment'));assert.equal(core.reviewHistoryPolicy(),'original');
    const anchor=core.captureReviewAnchor({kind:'selection',selection:{kind:'node',block:'image-block'}}),born=core.dispatchReview({kind:'create_thread',data:{anchorJson:anchor,body:'Original 🙂'}});assert.equal(born.kind,'committed');peer.receiveReview(core.exportReview(),policy('comment'));
    const original=core.reviewCheckpoint(),doc=core.checkpointJson(),stale=core.reviewSnapshot(),foreign=peer.reviewSnapshot();let notifications=0;const off=core.subscribeReview(()=>notifications++);
    core.enableReviewHistoryGenerations('root','active',stale);assert.equal(notifications,1);assert.equal(core.reviewHistoryPolicy(),'segmented-v1');assert.equal(core.checkpointJson(),doc);assert.equal(JSON.parse(core.reviewSegmentedCheckpoint()).root,original);counts.independentDocumentFamilies++;
    assert.throws(()=>core.dispatchReview({kind:'reply',data:{thread:born.event,body:'stale'}},stale),error=>error.code==='stale_review');counts.staleGuardRefusals++;
    assert.throws(()=>core.sealReviewHistoryGeneration('next',foreign),error=>error.code==='stale_review');counts.foreignGuardRefusals++;
    assert.throws(()=>core.reviewCheckpoint());counts.originalGetterRefusals++;
    const active=core.reviewSegmentedCheckpoint();assert.throws(()=>core.sealReviewHistoryGeneration('next'));assert.equal(core.reviewSegmentedCheckpoint(),active);
    core.dispatchReview({kind:'reply',data:{thread:born.event,body:'Retained Redo'}});core.sealReviewHistoryGeneration('next');core.undoReview();
    const authored=core.localReviewClock();core.setReviewAccess('read_only');assert.throws(()=>core.sealObserverReviewHistoryGeneration('later'));counts.strictObserverRefusals++;core.sealReadOnlyReviewHistoryGeneration('later');counts.readOnlyBoundaries++;assert.deepEqual(core.localReviewClock(),authored);
    core.setReviewAccess('comment');peer.dispatchReview({kind:'reply',data:{thread:born.event,body:'Offline peer'}});const frame=peer.exportReview();core.receiveReview(frame,peerPolicy);const receipt=core.retainedReviewReceipt(frame,peerPolicy);core.sealReviewHistoryGeneration('last');
    const exact=core.reviewSegmentedCheckpoint(),savedDocument=core.checkpointJson(),files=JSON.parse(exact);
    cold=configure(restore(profile,savedDocument,scope,natural,segmented),scope,natural,segmented);cold.enableSegmentedReview(policy('comment'),exact);counts.coldPairs++;assert.equal(cold.reviewSegmentedCheckpoint(),exact);assert.deepEqual(cold.reviewSnapshot().view,core.reviewSnapshot().view);assert.deepEqual(cold.retainedReviewReceipt(frame,peerPolicy),receipt);
    if(segmented)cold.verifySegmentedRecoveryOrigin(core);else cold.verifyRecoveryOrigin(core);counts.pairedNativeOrigins++;
    for(const name of ['redoReview','undoReview','redoReview']){assert.deepEqual(core[name](),cold[name]());assert.equal(core.reviewSegmentedCheckpoint(),cold.reviewSegmentedCheckpoint());assert.equal(core.checkpointJson(),savedDocument);assert.equal(cold.checkpointJson(),savedDocument);counts.futureHistoryPairs++;}
    const final=JSON.parse(core.reviewSegmentedCheckpoint());assert.equal(final.root,files.root);assert.deepEqual(final.sealed,files.sealed);counts.exactFiles+=files.sealed.length+1;off();
    locked=configure(restore(profile,savedDocument,scope,natural,segmented),scope,natural,segmented);locked.enableSegmentedReview(policy('read_only'),core.reviewSegmentedCheckpoint());const before=locked.reviewSegmentedCheckpoint();assert.throws(()=>locked.undoReview());assert.equal(locked.reviewSegmentedCheckpoint(),before);counts.coldPairs++;
    const staleSeal=locked.reviewSnapshot();locked.sealReadOnlyReviewHistoryGeneration('passive');assert.throws(()=>locked.reviewSegmentedCheckpoint(staleSeal),error=>error.code==='stale_review');counts.staleGuardRefusals++;counts.readOnlyBoundaries++;
    assert.throws(()=>locked.sealReviewPolicies(natural?'typing-v1':'explicit',scope===1?'general-v1':'original'),error=>error.code==='review_generation_storage_required');counts.pinnedStoreRefusals++;if(segmented){assert.throws(()=>locked.sealSegmentedPolicies(natural?'typing-v1':'explicit',scope===1?'general-v1':'original'),error=>error.code==='review_generation_storage_required');counts.pinnedStoreRefusals++;}
    unattached=configure(profile.create(input,'404'),scope,natural,false);unattached.enableReview(policy('comment'));unattached.sealReviewPolicies(natural?'typing-v1':'explicit',unattached.view().rangeEditing??'original');const pinned=unattached.reviewCheckpoint();assert.throws(()=>unattached.enableReviewHistoryGenerations('root','active'),error=>error.code==='review_generation_storage_required');assert.equal(unattached.reviewCheckpoint(),pinned);counts.pinnedStoreRefusals++;
    counts.cases++;
   }catch(error){throw new Error(`Review generation facade language=${language} standard=${standard} scope=${scope} natural=${natural} documentGenerations=${segmented}`,{cause:error});}
   finally{unattached?.dispose();locked?.dispose();cold?.dispose();peer?.dispose();core?.dispose();}
  }}finally{profile.free();}
 }
 assert.equal(counts.cases,72);assert.equal(counts.coldPairs,144);assert.equal(counts.futureHistoryPairs,216);assert.equal(counts.staleGuardRefusals,144);assert.equal(counts.foreignGuardRefusals,72);assert.equal(counts.originalGetterRefusals,72);assert.equal(counts.pinnedStoreRefusals,180);assert.equal(counts.strictObserverRefusals,72);assert.equal(counts.readOnlyBoundaries,144);assert.equal(counts.exactFiles,288);assert.equal(counts.pairedNativeOrigins,72);
 return{format:'breditor/review-generation-sdk-probe',passed:true,...counts,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex'),scope:'Real native comments in both document history families through the explicitly selected SDK facade. Composite guards, old-store refusals, read-only former authors, old offline peer and exact future native histories. No independent managed storage or authenticated relay capability is implied.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error('Require an explicitly built normal native runtime');console.log(JSON.stringify(await probeReviewGenerationSdk(process.argv[2]),null,2));}
