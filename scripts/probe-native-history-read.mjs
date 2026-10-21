/** Same actual-native lane and future-history assertions in source and installed packages. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cleanupEnvironment,databaseCut} from './fixtures/owned-core-cleanup/environment.mjs';
import {cleanupFamilies,nativeProfile,cleanupSession,insertCleanupText,cleanupNativePair} from './fixtures/owned-core-cleanup/session.mjs';
import {captureHistorySession,borrowedHistoryOperations} from './fixtures/native-history-read/capture.mjs';

export async function probeNativeHistoryRead({api,historyReads,runtime}){
 for(const name of ['capturedNativeHistoryRead','registerCapturedNativeHistory','checkCapturedNativeHistoryRead','releaseCapturedNativeHistory','nativeHistoryIntrinsics'])assert.equal(name in api,false);
 const wasm=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await wasm.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const counts={cases:0,selectedReviewLanes:0,absentReviewLanes:0,exactDocumentReads:0,exactReviewReads:0,transportReadPairs:0,unchangedDurableCuts:0,disposedCaptureRefusals:0,coldPairs:0,futureHistoryPairs:0};
 for(const[language,standard]of [[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const profile=nativeProfile(wasm,language,standard);try{for(const scope of [0,1,2])for(const family of cleanupFamilies)for(const history of [0,1]){
   const environment=cleanupEnvironment(),mask=history?['original','generation'].includes(family)?5:7:0,selected=cleanupSession(api,profile,{family,language,scope,mask,database:'native-history-matrix-'+counts.cases});let session,cold,peer,oracle,source;
   try{
    session=await selected.open();const core=session.core;insertCleanupText(core,'Native first ');insertCleanupText(core,'Native Redo ');core.undo();
    let thread;if(selected.paired){const created=core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Native first comment'}});thread=created.event;core.dispatchReview({kind:'reply',data:{thread,body:'Native review Redo'}});core.undoReview();}
    if(selected.segmentedDocument){if(selected.independent)await session.sealDocumentGeneration('second');else await session.sealGeneration('second');}if(selected.segmentedReview)await session.sealReviewGeneration('second');
    peer=new api.SharedRichEditor(profile.join_frame('room','202',core.updateFrame()));insertCleanupText(peer,'Offline peer ');await core.receiveFrame(peer.updateFrame());
    if(selected.paired){peer.enableReview({actor:'peer-comments',principal:'bob',access:'comment'});peer.receiveReview(core.exportReview(),selected.review);peer.dispatchReview({kind:'reply',data:{thread,body:'Offline peer comment'}});core.receiveReview(peer.exportReview(),{actor:'peer-comments',principal:'bob',access:'comment'});await session.retainVersion(core.captureVersion('Native reader version','alice','1'));}
    await session.flush();const exact=cleanupNativePair(core,selected),stored=await databaseCut(selected.database);source=captureHistorySession(api,session,selected);const reader=historyReads.capturedNativeHistoryRead(source),doc=reader.document;
    historyReads.checkCapturedNativeHistoryRead(reader);assert.equal(doc.kind,selected.segmentedDocument?'segmented-v1':'original');assert.equal(doc.checkpointJson(),exact[0]);counts.exactDocumentReads++;assert.deepEqual(doc.descriptor(),core.descriptor());
    for(const method of ['writerClock','writerClockV2'])assert.deepEqual(doc[method]('101'),core[method]('101'));
    for(const method of ['writerGroups','writerGroupsV2']){assert.deepEqual(doc[method]('0'),core[method]('0'));counts.transportReadPairs++;}
    if(selected.paired){assert.equal(reader.review.kind,selected.segmentedReview?'segmented-v1':'original');assert.equal(reader.review.checkpointJson(),exact[1]);counts.exactReviewReads++;assert.deepEqual(reader.review.localReviewClock(),core.localReviewClock());assert.deepEqual(reader.review.reviewWriterClock('comments','alice'),core.reviewWriterClock('comments','alice'));counts.selectedReviewLanes++;if(selected.segmentedReview)assert.throws(()=>core.reviewCheckpoint());}
    else{assert.deepEqual(reader.review,{kind:'absent'});counts.absentReviewLanes++;}
    assert.equal(await databaseCut(selected.database),stored);counts.unchangedDurableCuts++;
    const raw=selected.segmentedDocument?profile.restore_segmented('room',exact[0]):selected.restore(exact[0]),editor={...(selected.segmentedDocument?{segmentedHistory:'segmented-v1'}:{}),...(mask&4?{searchHistory:'search-v1'}:{}),...(mask&2?{reviewedHistory:selected.options.reviewedHistory}:{})};oracle=scope===2?api.createSharedDocumentEditor(raw,editor):new api.SharedRichEditor(raw,editor);if(selected.paired){if(selected.segmentedReview)oracle.enableSegmentedReview(selected.review,exact[1]);else oracle.enableReview(selected.review,exact[1]);}
    const borrowed=borrowedHistoryOperations(reader,historyReads.checkCapturedNativeHistoryRead);source.dispose();for(const read of borrowed){assert.throws(read);counts.disposedCaptureRefusals++;}assert.deepEqual(cleanupNativePair(core,selected),exact);
    for(const method of ['redo','undo','redo']){assert.equal(core[method](),oracle[method]());if(selected.paired){const comment=method==='redo'?'redoReview':'undoReview';assert.deepEqual(core[comment](),oracle[comment]());assert.match(JSON.stringify(core.reviewSnapshot().view),/Offline peer comment/);}assert.deepEqual(cleanupNativePair(core,selected),cleanupNativePair(oracle,selected));assert.match(core.documentJson(),/Offline peer/);counts.futureHistoryPairs++;}
    const after=cleanupNativePair(core,selected);await session.close();assert.equal(environment.held.size,0);cold=await selected.open();assert.deepEqual(cleanupNativePair(cold.core,selected),after);counts.coldPairs++;await cold.close();assert.equal(environment.held.size,0);counts.cases++;
   }catch(error){throw new Error(`Borrowed native history family=${family} grammar=${language} standard=${standard} scope=${scope} mask=${mask} case=${counts.cases}`,{cause:error});}
   finally{source?.dispose();oracle?.dispose();peer?.dispose();try{await cold?.discardAndClose();}finally{try{await session?.discardAndClose();}finally{environment.restore();}}}
  }}finally{profile.free();}
 }
 assert.deepEqual(counts,{cases:300,selectedReviewLanes:240,absentReviewLanes:60,exactDocumentReads:300,exactReviewReads:240,transportReadPairs:600,unchangedDurableCuts:300,disposedCaptureRefusals:3120,coldPairs:300,futureHistoryPairs:900});
 return{format:'breditor/captured-native-history-probe',formatVersion:1,passed:true,...counts,sharedWasmSha256:createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'Internal genuine capture reads through actual normal native histories across ten persistence families. Both native wire reads, byte-exact original/segmented lanes, offline peers and future local Undo/Redo remain unchanged. No editing/owner/transport capability is exported. Synthetic storage/locks; not independent relay adoption, physical durability, authentication, activation or V1 approval.'};
}
