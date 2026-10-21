/** Same public API assertions in source and installed packages; real native histories, synthetic IDB/locks. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cleanupEnvironment,databaseCut} from './fixtures/owned-core-cleanup/environment.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {deliverySession,attachDelivery,pendingDelivery} from './fixtures/independent-delivery/session.mjs';

export async function probeIndependentDelivery({api,runtime}){
 for(const name of ['IndependentDeliveryCompanion','registerIndependentDeliverySession','withIndependentDeliveryCompanion','independentHistoryNative','withIndependentRetainedPort'])assert.equal(name in api,false);
 const bytes=readFileSync(resolve(runtime,'breditor_shared_bg.wasm')),native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await native.default({module_or_path:bytes});
 const counts={cases:0,coldPairs:0,futureHistoryPairs:0,retainedPackets:0,independentBoundaries:0,exactDurableCuts:0,tokenCalls:0};
 for(const[language,standard]of [[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const profile=nativeProfile(native,language,standard);try{for(const scope of [0,1,2])for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const mask of [0,7]){
   const environment=cleanupEnvironment(),selected=deliverySession(api,profile,{language,scope,mask,documentSegmented,reviewSegmented,database:'independent-delivery-matrix-'+counts.cases});let session,cold,peer,oracle;
   const pair=core=>[core.checkpointJson(),reviewSegmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()];
   try{
    session=await selected.open();const parts=await attachDelivery(api,session,selected.options,{onToken(){counts.tokenCalls++;}}),core=session.core;
    insertCleanupText(core,'Native first ');insertCleanupText(core,'Native Redo ');assert.equal(core.undo(),true);
    const thread=core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Native first comment'}}).event;core.dispatchReview({kind:'reply',data:{thread,body:'Native review Redo'}});assert.equal(core.undoReview().kind,'committed');
    const ids=await pendingDelivery(session,parts),packets=[parts.queue.packet(ids.proposal.id),parts.revisions.packet(ids.revision.id),parts.versions.versionPacket(ids.version.id)];counts.retainedPackets+=packets.length;
    if(documentSegmented){await session.sealDocumentGeneration('second');counts.independentBoundaries++;}if(reviewSegmented){await session.sealReviewGeneration('second');counts.independentBoundaries++;}
    peer=new api.SharedRichEditor(profile.join_frame('room','202',core.updateFrame()));insertCleanupText(peer,'Offline peer ');core.receiveFrame(peer.updateFrame());peer.enableReview({actor:'peer-comments',principal:'bob',access:'comment'});peer.receiveReview(core.exportReview(),selected.review);peer.dispatchReview({kind:'reply',data:{thread,body:'Offline peer comment'}});core.receiveReview(peer.exportReview(),{actor:'peer-comments',principal:'bob',access:'comment'});
    await session.retainVersion(core.captureVersion('Native version','alice','5'));await session.flush();const recovery=session.exportRecovery(),exact=pair(core),stored=await databaseCut(selected.database);
    const raw=documentSegmented?profile.restore_segmented('room',exact[0]):selected.restore(exact[0]),editor={...(documentSegmented?{segmentedHistory:'segmented-v1'}:{}),...(mask&4?{searchHistory:'search-v1'}:{}),...(mask&2?{reviewedHistory:selected.options.reviewedHistory}:{})};oracle=scope===2?api.createSharedDocumentEditor(raw,editor):new api.SharedRichEditor(raw,editor);if(reviewSegmented)oracle.enableSegmentedReview(selected.review,exact[1]);else oracle.enableReview(selected.review,exact[1]);
    await session.close();assert.equal(environment.held.size,0);assert.equal(await databaseCut(selected.database),stored);counts.exactDurableCuts++;
    cold=await selected.open();const restored=await attachDelivery(api,cold,selected.options,{onToken(){counts.tokenCalls++;}});assert.deepEqual(cold.exportRecovery(),recovery);assert.deepEqual(pair(cold.core),exact);assert.deepEqual([restored.queue.packet(ids.proposal.id),restored.revisions.packet(ids.revision.id),restored.versions.versionPacket(ids.version.id)],packets);assert.equal(restored.queue.status(ids.proposal.id).intent.retry,true);assert.equal(restored.revisions.status(ids.revision.id).retry,true);assert.equal(restored.versions.versionStatus(ids.version.id).queued,true);assert.equal(cold.versions().length,1);assert.equal(await databaseCut(selected.database),stored);counts.exactDurableCuts++;counts.coldPairs++;
    for(const method of ['redo','undo','redo']){assert.equal(cold.core[method](),oracle[method]());const comment=method==='redo'?'redoReview':'undoReview';assert.deepEqual(cold.core[comment](),oracle[comment]());assert.deepEqual(pair(cold.core),pair(oracle));assert.match(cold.core.documentJson(),/Offline peer/);assert.match(JSON.stringify(cold.core.reviewSnapshot().view),/Offline peer comment/);counts.futureHistoryPairs++;}
    await cold.flush();await cold.close();assert.equal(environment.held.size,0);counts.cases++;
   }catch(error){throw new Error(`Independent delivery grammar=${language} standard=${standard} scope=${scope} mask=${mask} document=${documentSegmented} review=${reviewSegmented} case=${counts.cases}`,{cause:error});}
   finally{oracle?.dispose();peer?.dispose();try{await cold?.discardAndClose();}finally{try{await session?.discardAndClose();}finally{environment.restore();}}}
  }}finally{profile.free();}
 }
 for(const[key,value]of Object.entries({cases:120,coldPairs:120,futureHistoryPairs:360,retainedPackets:360,independentBoundaries:120,exactDurableCuts:240,tokenCalls:0}))assert.equal(counts[key],value,key);
 return{format:'breditor/independent-delivery-probe',formatVersion:1,passed:true,...counts,sharedWasmSha256:createHash('sha256').update(bytes).digest('hex'),scope:'Five native grammar/inline profiles, three editing scopes, all four independently selected native history pairs and explicit/typing+reviewed+search policies. Genuine co-owned pending proposal/revision/decision/version packets, offline peer text/comments, exact cold paired replay and future native Undo/Redo. Synthetic storage/locks; no network, physical room/asset adoption or release approval.'};
}
