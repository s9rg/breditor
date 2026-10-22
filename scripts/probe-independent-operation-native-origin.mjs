/** Full genuine native-policy matrix for the private operation-origin autosave boundary. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile,insertCleanupText} from './fixtures/owned-core-cleanup/session.mjs';
import {deliveryParticipantSession} from './fixtures/independent-delivery-participant/session.mjs';
import {attachDelivery,pendingDelivery} from './fixtures/independent-delivery/session.mjs';
import {recoveryOptions} from './fixtures/independent-delivery-recovery/session.mjs';
import {pixel,secondPixel,secondAsset} from './fixtures/review-assets/pixels.mjs';

export async function probeIndependentOperationNativeOrigin({api,rich,internals,runtime,fixture}){
 const {IndependentNativeOperationOrigin:Origin,openNativeOriginVerifiedIndependentDelivery:open,restoreNativeOriginVerifiedIndependentDelivery:restore,prepareIndependentDeliveryRecovery:prepare,snapshotIndependentDeliveryRecovery:snapshot}=internals;
 const restoreEnvironment=environment(),native=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await native.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const root=JSON.parse(readFileSync(fixture,'utf8')),counts={cases:0,nativeOrigins:0,coldSources:0,futureHistoryPairs:0,retainedPacketComparisons:0,localVersionComparisons:0,readOnlyRefusals:0,wireOne:0,wireTwo:0,allRetainedCases:0,versionRetainedCases:0,tokenCalls:0};
 for(const name of ['IndependentNativeOperationOrigin','withIndependentNativeOrigin','openNativeOriginVerifiedIndependentDelivery','restoreNativeOriginVerifiedIndependentDelivery'])assert.equal(name in api,false);
 try{for(const[language,standard]of [[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const profile=nativeProfile(native,language,standard);
  try{for(const scope of [0,1,2])for(const mask of [0,1,2,3,4,5,6,7])for(const wire of scope===2||mask&2?[2]:[1,2])for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true]){
   // Document selection and owned review already require atomic-v2. Suggestion/
   // revision outboxes do too. Original wire keeps its supported version outbox.
   // Exercise every legal flag mask without relaxing a production binding rule.
   const retained=wire===1?'versions':'all',tag='independent-operation-origin-'+counts.cases,selected=deliveryParticipantSession(api,profile,root,{language,scope,mask,wire,retained,documentSegmented,reviewSegmented,database:tag}),pair=core=>[core.checkpointJson(),reviewSegmented?core.reviewSegmentedCheckpoint():core.reviewCheckpoint()];
   let source,uploads,backup,prepared,origin,current,peer;
   try{
    source=await selected.open();insertCleanupText(source.core,'Retained native Undo ');insertCleanupText(source.core,'Retained native Redo ');assert.equal(source.core.undo(),true);
    const thread=source.core.dispatchReview({kind:'create_thread',data:{anchorJson:source.core.captureReviewAnchor({kind:'document'}),body:'Retained native comment'}}).event;source.core.dispatchReview({kind:'reply',data:{thread,body:'Retained native comment Redo'}});assert.equal(source.core.undoReview().kind,'committed');
    const parts=await attachDelivery(api,source,selected.options,{onToken(){counts.tokenCalls++;}}),ids=wire===2?await pendingDelivery(source,parts):{version:parts.versions.saveVersion('Queued original-wire version','3')};await parts.versions.flush();const packets=wire===2?[parts.queue.packet(ids.proposal.id),parts.revisions.packet(ids.revision.id),parts.versions.versionPacket(ids.version.id)]:[parts.versions.versionPacket(ids.version.id)];
    await source.retainVersion(source.core.captureVersion('Original local version','alice','5'));if(documentSegmented)await source.sealDocumentGeneration('two');if(reviewSegmented)await source.sealReviewGeneration('two');
    uploads=await rich.RichAssetStore.open(tag+'-uploads');await uploads.ingest(new Blob([pixel],{type:'image/png'}));await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));await uploads.cancel(secondAsset);
    const outcome=await api.captureSharedIndependentDeliveryParticipant({participant:tag,principal:'alice',source:{session:source},assets:uploads,checkAuthority(){}});assert.equal(outcome.kind,'ready');backup=outcome.backup;
    const options=recoveryOptions(selected.options,backup,tag+'-recovery');prepared=await prepare(snapshot(options,false),backup.file());origin=await Origin.read(prepared);origin.verifyCore(source.core,source.exportRecovery().source.versions);counts.nativeOrigins++;
    // Genuine foreign changes preserve both retained local Redo stacks.
    peer=new api.SharedRichEditor(profile.join_frame('room','202',source.core.updateFrame()));peer.enableReview({actor:'peer-comments',principal:'bob',access:'comment'});peer.receiveReview(source.core.exportReview(),selected.review);insertCleanupText(peer,'Preserved offline peer ');await source.core.receiveFrame(peer.updateFrame());peer.dispatchReview({kind:'reply',data:{thread,body:'Preserved offline peer comment'}});source.core.receiveReview(peer.exportReview(),{actor:'peer-comments',principal:'bob',access:'comment'});await source.flush();
    await source.retainVersion(source.core.captureVersion('Later local version','alice','6'));if(documentSegmented)await source.sealDocumentGeneration('three');if(reviewSegmented)await source.sealReviewGeneration('three');const before=source.exportRecovery(),expected=[];
    for(const method of ['redo','undo','redo']){assert.equal(source.core[method](),true);assert.equal(source.core[method==='redo'?'redoReview':'undoReview']().kind,'committed');expected.push(pair(source.core));}await source.close();
    const destination={...selected.options,database:tag+'-current',recovery:before,writerRecovery:'host-reacquired'};current=await restore(destination,origin);counts.coldSources++;assert.deepEqual(current.exportRecovery(),before);
    const restored=await attachDelivery(api,current,selected.options,{onToken(){counts.tokenCalls++;}}),currentPackets=wire===2?[restored.queue.packet(ids.proposal.id),restored.revisions.packet(ids.revision.id),restored.versions.versionPacket(ids.version.id)]:[restored.versions.versionPacket(ids.version.id)];assert.deepEqual(currentPackets,packets);counts.retainedPacketComparisons+=packets.length;assert.deepEqual(current.exportRecovery().source.versions,before.source.versions);counts.localVersionComparisons++;
    for(const[index,method]of ['redo','undo','redo'].entries()){assert.equal(current.core[method](),true);assert.equal(current.core[method==='redo'?'redoReview':'undoReview']().kind,'committed');assert.deepEqual(pair(current.core),expected[index]);assert.match(current.core.documentJson(),/Preserved offline peer/);assert.match(JSON.stringify(current.core.reviewSnapshot().view),/Preserved offline peer comment/);counts.futureHistoryPairs++;}
    await current.flush();const saved=current.exportRecovery();await current.close();current=await open({...selected.options,database:destination.database,readOnly:true,review:{...selected.options.review,access:'read_only'}},origin);counts.coldSources++;assert.deepEqual(current.exportRecovery(),saved);assert.equal(current.core.view().readOnly,true);assert.throws(()=>insertCleanupText(current.core,'Forbidden'));assert.throws(()=>current.core.undoReview());counts.readOnlyRefusals+=2;assert.deepEqual(current.exportRecovery().source.versions,before.source.versions);counts.localVersionComparisons++;
    counts.cases++;counts[wire===1?'wireOne':'wireTwo']++;counts[wire===1?'versionRetainedCases':'allRetainedCases']++;
   }catch(error){throw new Error(`Native operation origin grammar=${language} standard=${standard} scope=${scope} mask=${mask} wire=${wire} document=${documentSegmented} review=${reviewSegmented} case=${counts.cases}`,{cause:error});}
   finally{await current?.discardAndClose();await source?.discardAndClose();origin?.dispose();prepared?.backup.dispose();backup?.dispose();uploads?.close();peer?.dispose();}
  }}finally{profile.free();}
 }}finally{restoreEnvironment();}
 for(const[key,value]of Object.entries({cases:640,nativeOrigins:640,coldSources:1280,futureHistoryPairs:1920,retainedPacketComparisons:1600,localVersionComparisons:1280,readOnlyRefusals:1280,wireOne:160,wireTwo:480,allRetainedCases:480,versionRetainedCases:160,tokenCalls:0}))assert.equal(counts[key],value,key);
 return{format:'breditor/independent-operation-native-origin-probe',formatVersion:1,passed:true,...counts,sharedWasmSha256:createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'Actual original/segmented document and independent comment ancestry before autosave, current host policy, native future Undo/Redo, pending packet preservation and append-only local versions across all existing native policy combinations and both wire versions. IndexedDB, locks and raster presentation are fixtures. Not durable operational intent/outbox retirement accounting, complete participant/room adoption, server activation or platform durability.'};
}
