/** Actual normal-native terminal cleanup and cold/future histories. No browser/OS lock qualification. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cleanupEnvironment,databaseCut} from './fixtures/owned-core-cleanup/environment.mjs';
import {cleanupFamilies,nativeProfile,cleanupSession,insertCleanupText,cleanupNativePair} from './fixtures/owned-core-cleanup/session.mjs';
export async function probeOwnedCoreCleanup({api,runtime}){
 for(const name of ['retireOwnedCore','disposeOwnedCore','managedCoreRetainedRevisions'])assert.equal(name in api,false,name+' stays internal');
 const wasm=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')));await wasm.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const counts={cases:0,coldPairs:0,futureHistoryPairs:0,durableCutComparisons:0,stateAfterDisposeComparisons:0,failedCloseRefusals:0,overrideCases:0,publicTerminalCalls:0,coreGetterCalls:0,foreignOwnerChecks:0,retainedVersionOwners:0,tokenCalls:0};
 for(const[language,standard]of [[1,false],[2,false],[2,true],[3,false],[3,true]]){
  const profile=nativeProfile(wasm,language,standard);try{for(const scope of [0,1,2])for(const family of cleanupFamilies)for(const history of [0,1]){
   const environment=cleanupEnvironment(),mask=history?['original','generation'].includes(family)?5:7:0,selected=cleanupSession(api,profile,{family,language,scope,mask,database:'cleanup-matrix-'+counts.cases});let session,cold,peer,oracle,foreign,versions;
   try{
    session=await selected.open();const core=session.core;insertCleanupText(core,'Native first ');insertCleanupText(core,'Native Redo ');core.undo();
    let thread;if(selected.paired){const created=core.dispatchReview({kind:'create_thread',data:{anchorJson:core.captureReviewAnchor({kind:'document'}),body:'Native first comment'}});thread=created.event;core.dispatchReview({kind:'reply',data:{thread,body:'Native review Redo'}});core.undoReview();}
    if(selected.segmentedDocument){if(selected.independent)await session.sealDocumentGeneration('second');else await session.sealGeneration('second');}if(selected.segmentedReview)await session.sealReviewGeneration('second');
    peer=new api.SharedRichEditor(profile.join_frame('room','202',core.updateFrame()));insertCleanupText(peer,'Offline peer ');await core.receiveFrame(peer.updateFrame());if(selected.paired){peer.enableReview({actor:'peer-comments',principal:'bob',access:'comment'});peer.receiveReview(core.exportReview(),selected.review);peer.dispatchReview({kind:'reply',data:{thread,body:'Offline peer comment'}});core.receiveReview(peer.exportReview(),{actor:'peer-comments',principal:'bob',access:'comment'});}
    if(selected.paired)await session.retainVersion(core.captureVersion('Saved cleanup version','alice','1'));await session.flush();
    if(family==='retained'){versions=await session.openVersionCatalog({autoConnect:false,getToken(){counts.tokenCalls++;throw Error('Cleanup must not authenticate or connect');}});counts.retainedVersionOwners++;}
    const exact=cleanupNativePair(core,selected),stored=await databaseCut(selected.database),before=session.state();
    const raw=selected.segmentedDocument?profile.restore_segmented('room',exact[0]):selected.restore(exact[0]),editor={...(selected.segmentedDocument?{segmentedHistory:'segmented-v1'}:{}),...(mask&4?{searchHistory:'search-v1'}:{}),...(mask&2?{reviewedHistory:selected.options.reviewedHistory}:{})};oracle=scope===2?api.createSharedDocumentEditor(raw,editor):new api.SharedRichEditor(raw,editor);if(selected.paired){if(selected.segmentedReview)oracle.enableSegmentedReview(selected.review,exact[1]);else oracle.enableReview(selected.review,exact[1]);}
    if(counts.cases<10){Object.defineProperty(core,'retire',{configurable:true,value(){counts.publicTerminalCalls++;throw Error('Caller override is not the owner cleanup method');}});Object.defineProperty(core,'dispose',{configurable:true,value(){counts.publicTerminalCalls++;throw Error('Caller override is not the owner cleanup method');}});counts.overrideCases++;}
    api.SharedRichEditor.prototype.dispose.call(core);api.SharedRichEditor.prototype.retire.call(core);assert.throws(()=>core.view(),error=>error.code==='disposed');assert.deepEqual(session.state(),before);counts.stateAfterDisposeComparisons++;
    await assert.rejects(Promise.resolve().then(()=>session.close()));counts.failedCloseRefusals++;
    if(counts.cases<10){foreign=new api.SharedRichEditor(profile.create(selected.document,'303'));Object.defineProperty(session,'core',{configurable:true,get(){counts.coreGetterCalls++;return foreign;}});}
    await Promise.all([session.discardAndClose(),session.discardAndClose()]);await session.close();assert.equal(environment.held.size,0);assert.equal(session.state().status,'closed');assert.equal(await databaseCut(selected.database),stored);counts.durableCutComparisons++;
    if(foreign){assert.doesNotThrow(()=>foreign.view());counts.foreignOwnerChecks++;}
    cold=await selected.open();assert.deepEqual(cleanupNativePair(cold.core,selected),exact);assert.equal(await databaseCut(selected.database),stored);counts.durableCutComparisons++;counts.coldPairs++;
    for(const method of ['redo','undo','redo']){assert.equal(cold.core[method](),oracle[method]());if(selected.paired){const comment=method==='redo'?'redoReview':'undoReview';assert.deepEqual(cold.core[comment](),oracle[comment]());assert.match(JSON.stringify(cold.core.reviewSnapshot().view),/Offline peer comment/);}assert.deepEqual(cleanupNativePair(cold.core,selected),cleanupNativePair(oracle,selected));assert.match(cold.core.documentJson(),/Offline peer/);counts.futureHistoryPairs++;}await cold.close();assert.equal(environment.held.size,0);counts.cases++;
   }catch(error){throw new Error(`Owned cleanup family=${family} grammar=${language} standard=${standard} scope=${scope} mask=${mask} case=${counts.cases}`,{cause:error});}
   finally{oracle?.dispose();peer?.dispose();foreign?.dispose();try{await cold?.discardAndClose();}finally{try{await session?.discardAndClose();}finally{environment.restore();}}}
  }}finally{profile.free();}
 }
 assert.equal(counts.cases,300);assert.equal(counts.coldPairs,300);assert.equal(counts.futureHistoryPairs,900);assert.equal(counts.durableCutComparisons,600);assert.equal(counts.retainedVersionOwners,30);assert.equal(counts.publicTerminalCalls,0);assert.equal(counts.coreGetterCalls,0);assert.equal(counts.foreignOwnerChecks,10);assert.equal(counts.tokenCalls,0);
 return{format:'breditor/owned-core-cleanup-probe',formatVersion:1,passed:true,...counts,sharedWasmSha256:createHash('sha256').update(readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))).digest('hex'),scope:'Normal native editors and SDK-owned sessions/components. Explicit discard after prior native disposal releases actual SDK writer leases; last publication clocks are metadata only. Native cold/future document/comment histories and original durable cuts stay exact. Synthetic storage/locks only, not physical crash durability, remote authorization or activation.'};
}
