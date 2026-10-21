/** Actual physical source files and private mixed native clients. No activation or browser claim. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {recoverParticipant} from './fixtures/room-participant-inventory/participant.mjs';
import {generationParticipant} from './fixtures/room-participant-inventory/generation-participant.mjs';
import {pixel,secondPixel} from './fixtures/review-assets/pixels.mjs';
import {probePhysicalStageFaults} from './fixtures/physical-room-stage/faults.mjs';
import {checkPhysicalCatalogCacheRelease} from './fixtures/physical-room-stage/release.mjs';
const bytes=async file=>Buffer.from(await file.arrayBuffer());
function originalRequest(h,id,tag){const{backup:_backup,expected:_expected,checkAuthority:_guard,...rest}=h.recovery;return{id,family:'original',recovery:{...rest,database:tag+'-attempt',destinations:Object.fromEntries(Object.keys(rest.destinations).map(key=>[key,tag+'-'+key]))}};}
function generationRequest(h,id,tag){const{database:_database,create:_create,initialGenerations:_initial,initialReviewCheckpoint:_review,binding,retained,...native}=h.options;return{id,family:'generation',recovery:{database:tag+'-attempt',destinations:{source:tag+'-source',uploads:tag+'-uploads'},session:{kind:h.kind,options:{...native,...(h.kind!=='local'?{binding}:{}),...(h.kind==='retained'?{retained}:{})}}}};}
async function futureOriginal({api,profile,row,request,before,readOnly,counts,stagedReadOnlyFactory}){
 let attempt,ready,operation,parts,reference,capture,backup;
 try{
  backup=await api.readSharedParticipantBackup(row.file,row.expected);
  const o=request.recovery.session.options,readonlyOptions={...o,review:{...o.review,access:'read_only'}};readonlyOptions.restore=stagedReadOnlyFactory(o.restore,readonlyOptions,()=>{});
  const selected={...request.recovery,backup,expected:row.expected,session:{kind:request.recovery.session.kind,options:readonlyOptions},checkAuthority(){}};
  attempt=await api.SharedParticipantRecovery.resume(selected);ready=await attempt.finish();assert.equal(ready.session.core.view().readOnly,true);
  const operationDatabase=request.recovery.database+'-future-operation';operation=await api.OperationalSharedParticipant.begin({database:operationDatabase,recovered:ready,expected:row.expected,checkAuthority(){}});await operation.close();operation=undefined;
  const{backup:_backup,database:recoveryDatabase,...base}=selected;
  operation=await api.OperationalSharedParticipant.resume({...base,database:operationDatabase,recoveryDatabase,currentPolicy:{documentReadOnly:readOnly,reviewAccess:readOnly?'read_only':o.review.access}});parts=await operation.intoParts();operation=undefined;counts.originalOperationalHandoffs++;
  const core=parts.session.core;
  assert.equal(core.checkpointJson(),before.document);assert.equal(core.reviewCheckpoint(),before.review);
  capture=api.captureSharedAssetReferences(parts.sources);await backup.verifyRecovered(capture,parts.uploads);
  if(!readOnly){
   reference=new api.SharedRichEditor(profile.restore(request.recovery.session.options.room,core.checkpointJson()));reference.enableReview(request.recovery.session.options.review,core.reviewCheckpoint());
   for(const method of ['redo','undo']){assert.equal(core[method](),reference[method]());assert.equal(core.checkpointJson(),reference.checkpointJson());assert.equal(core.documentJson(),reference.documentJson());counts.futureDocumentComparisons++;assert.deepEqual(core[method+'Review'](),reference[method+'Review']());assert.equal(core.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewComparisons++;}
  }
  counts.futureOriginalOwners++;
 }finally{reference?.dispose();capture?.dispose();if(parts){await parts.sources.revisions?.close();await parts.sources.suggestions?.close();await parts.sources.versions?.close();await parts.session.close();parts.uploads.close();}await operation?.discardAndClose();await ready?.close();await attempt?.close();backup?.dispose();}
}
async function futureGeneration({api,profile,row,request,before,readOnly,kind,counts}){
 let attempt,ready,parts,reference;
 try{
  attempt=await api.SharedGenerationParticipantRecovery.resume({...request.recovery,expected:row.expected,checkAuthority(){}});ready=await attempt.finish();parts=await ready.intoParts();const session=parts.source.session,core=session.core;
  assert.deepEqual(kind==='retained'?session.exportRetainedRecovery():session.exportRecovery(),before);
  if(!readOnly){
   reference=new api.SharedRichEditor(profile.restore_segmented(request.recovery.session.options.room,core.checkpointJson()),{segmentedHistory:'segmented-v1'});reference.enableReview(request.recovery.session.options.review,core.reviewCheckpoint());
   for(const method of ['redo','undo']){assert.equal(core[method](),reference[method]());assert.equal(core.checkpointJson(),reference.checkpointJson());assert.equal(core.documentJson(),reference.documentJson());counts.futureDocumentComparisons++;assert.deepEqual(core[method+'Review'](),reference[method+'Review']());assert.equal(core.reviewCheckpoint(),reference.reviewCheckpoint());counts.futureReviewComparisons++;}
  }
  counts.futureGenerationOwners++;
 }finally{reference?.dispose();await parts?.source.session.close();parts?.uploads.close();await ready?.discardAndClose();await attempt?.close();}
}
export async function probePhysicalRoomStage(runtime,manifestPath,modules){
 const api=modules?.collaboration??await import('../packages/breditor-collaboration/dist/index.js'),rich=modules?.rich??await import('../packages/breditor-experimental-rich-content/index.js');
 const {stagedReadOnlyFactory}=modules?.factories??await import(new URL('./native_restore_factory.js',import.meta.resolve('@breditor/collaboration')).href);
 const {RecoveryLease}=modules?.leases??await import(new URL('./participant_recovery/lease.js',import.meta.resolve('@breditor/collaboration')).href);
 const {transferPhysicalRoomCatalog}=modules?.catalogs??await import(new URL('./physical_room_catalog/catalog.js',import.meta.resolve('@breditor/collaboration')).href);
 const wasm=await import(pathToFileURL(resolve(runtime,'breditor_shared.js')).href);await wasm.default({module_or_path:readFileSync(resolve(runtime,'breditor_shared_bg.wasm'))});
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.format,'breditor/native-server-generation-inventory-fixtures');assert.equal(manifest.cases.length,10);
 const counts={nativeRooms:0,cases:0,longNativeCuts:0,stagedParticipants:0,coldParticipants:0,coldStages:0,historicCopiesRetained:0,exactRetainedFiles:0,duplicateWriterRefusals:0,duplicateActorRefusals:0,duplicateDestinationRefusals:0,originalSignalDetaches:0,policySnapshots:0,changedPlanRefusals:0,occupiedBeginRefusals:0,markerAloneRefusals:0,futureOriginalOwners:0,futureGenerationOwners:0,originalOperationalHandoffs:0,closedCacheReleases:0,futureDocumentComparisons:0,futureReviewComparisons:0,networkCalls:0,restoredParticipants:0,restoredComponents:0},restore=environment();
 const testedTransports=new Set();try{for(const[roomIndex,item]of manifest.cases.entries()){
  const fixture=JSON.parse(readFileSync(item.path,'utf8')),folder=dirname(item.path),factory=fixture.language===1?'from_configuration_json':fixture.standard?'from_standard_configuration_json_v'+fixture.language:'from_configuration_json_v'+fixture.language,profile=wasm.SharedRichProfile[factory](fixture.configuration);
  const originFile=new Blob([readFileSync(resolve(folder,'server.backup'))]),currentFile=new Blob([readFileSync(resolve(folder,'server-after.backup'))]),inventoryFile=new Blob([readFileSync(resolve(folder,'inventory-after.json'))]);
  try{
   if(fixture.longNativeCut){assert.ok(fixture.afterRecoveryState.server.native.source.records>8192);counts.longNativeCuts++;}
   for(const kind of ['local','relay','retained']){
    const tag='physical-stage-'+roomIndex+'-'+kind,held=[];let archive,catalog,stage;
    try{
     const historic=await generationParticipant({api,rich,profile,fixture,client:fixture.clients[0],kind,counts,tag:tag+'-historic'});held.push(historic);
     const historicRow={id:'c-historic',family:'generation',file:historic.backup.file(),expected:historic.backup.selection()},historicPolicy=generationRequest(historic,historicRow.id,tag+'-historic-stage');await historic.close();
     const original=await recoverParticipant({api,rich,profile,fixture,client:fixture.clients[0],counts,tag:tag+'-original',uploads:[pixel,secondPixel]});held.push(original);
     const generation=await generationParticipant({api,rich,profile,fixture,client:fixture.clients[1],kind,counts,tag:tag+'-generation'});held.push(generation);
     const originalRow={id:'a-original',family:'original',file:original.backup.file(),expected:original.backup.selection()},generationRow={id:'b-generation',family:'generation',file:generation.backup.file(),expected:generation.backup.selection()},requests=[originalRequest(original,originalRow.id,tag+'-original-stage'),generationRequest(generation,generationRow.id,tag+'-generation-stage')];
     const beforeOriginal={document:original.recovered.session.core.checkpointJson(),review:original.recovered.session.core.reviewCheckpoint()},beforeGeneration=generation.exportRecovery(),originalReadOnly=original.readOnly,generationReadOnly=generation.readOnly;
     const capture={wasm,checkAuthority(){},catalog:tag,origin:{file:originFile,expected:fixture.afterRecoveryState.origin},current:{server:{file:currentFile,expected:fixture.afterRecoveryState.server},participants:{file:inventoryFile,expected:fixture.afterRecoveryState.participants}},participants:[originalRow,generationRow,historicRow]};
     archive=await api.SharedPhysicalRoomRecoveryCatalogArchive.capture(capture);const expected=archive.selection(),files=archive.files(),manifestText=archive.manifestJson(),prefix=archive.checkSources([{id:originalRow.id,family:'original',source:original.source},{id:generationRow.id,family:'generation',source:generation.source}]);
     assert.equal(prefix.kind,'pending');assert.deepEqual(prefix.unreconciledParticipants,['c-historic']);await generation.close();await original.close();
     if(roomIndex===0&&kind==='local')await checkPhysicalCatalogCacheRelease({api,wasm,archive,transferPhysicalRoomCatalog,counts,tag});
     const oldSignal=new AbortController();let oldAuthority=true;
     const catalogOpen={wasm,database:tag+'-catalog',expected,checkAuthority(){if(!oldAuthority)throw Error('Retired catalog authority');},signal:oldSignal.signal};
     catalog=await api.SharedPhysicalRoomRecoveryCatalog.begin({...catalogOpen,archive});
     const stageOpen={wasm,database:tag+'-intent',expected,checkAuthority(){}};
     stage=await api.SharedPhysicalRoomParticipantStage.begin({...stageOpen,catalog});assert.throws(()=>catalog.currentServerFile(),e=>e.code==='catalog_closed');await catalog.close();oldAuthority=false;oldSignal.abort();await stage.progress();counts.originalSignalDetaches++;
     archive.dispose();archive=undefined;
     await assert.rejects(stage.stage([requests[0],historicPolicy]),e=>e.code==='physical_stage_source');assert.equal((await stage.progress()).phase,'retained');
     const actors=requests.map(row=>({...row,recovery:{...row.recovery,session:{...row.recovery.session,options:{...row.recovery.session.options,review:{...row.recovery.session.options.review}}}}}));actors[1].recovery.session.options.review.actor=actors[0].recovery.session.options.review.actor;
     await assert.rejects(stage.stage(actors),e=>e.code==='physical_stage_source');assert.equal((await stage.progress()).phase,'retained');counts.duplicateActorRefusals++;
     const destinations=requests.map(row=>({...row,recovery:{...row.recovery,destinations:{...row.recovery.destinations}}}));destinations[1].recovery.destinations.source=destinations[0].recovery.destinations.document;
     await assert.rejects(stage.stage(destinations),e=>e.code==='physical_stage_policy');assert.equal((await stage.progress()).phase,'retained');counts.duplicateDestinationRefusals++;
     for(const request of [requests[0],historicPolicy])assert.equal((await indexedDB.databases()).some(row=>row.name===request.recovery.database),false);counts.duplicateWriterRefusals++;
     const mutable=requests.map(row=>({...row,recovery:{...row.recovery,destinations:{...row.recovery.destinations}}})),pending=stage.stage(mutable),changed=mutable[1].recovery.destinations.source+'-changed';
     mutable[1].recovery.destinations.source=changed;const result=await pending;assert.equal((await indexedDB.databases()).some(row=>row.name===changed),false);counts.policySnapshots++;
     assert.equal(result.kind,'pending');assert.deepEqual(result.source,fixture.afterSelected.source);assert.deepEqual(result.coverage,prefix.coverage);assert.deepEqual(result.unreconciledParticipants,['c-historic']);assert.equal((await stage.progress()).phase,'staged');assert.deepEqual(await stage.check(),result);counts.stagedParticipants+=2;
     await assert.rejects(stage.stage(requests.slice(1)),e=>e.code==='physical_stage_diverged');counts.changedPlanRefusals++;
     await stage.close();stage=undefined;
     catalog=await api.SharedPhysicalRoomRecoveryCatalog.resume({wasm,database:catalogOpen.database,expected,checkAuthority(){}});
     await assert.rejects(api.SharedPhysicalRoomParticipantStage.begin({...stageOpen,catalog}),e=>e.code==='physical_stage_exists');counts.occupiedBeginRefusals++;await catalog.verify();
     stage=await api.SharedPhysicalRoomParticipantStage.resume({...stageOpen,catalog});await assert.rejects(stage.check(),e=>e.code==='physical_stage_restore');counts.markerAloneRefusals++;
     assert.deepEqual(await stage.stage(requests),result);counts.coldParticipants+=2;counts.coldStages++;assert.deepEqual(await stage.check(),result);
     for(const[name,file]of files){const actual=name==='origin-server'?stage.originServerFile():name==='current-server'?stage.currentServerFile():name==='inventory'?stage.inventoryFile():stage.participantFile(name.slice('participant:'.length));assert.deepEqual(await bytes(actual),await bytes(file),name);counts.exactRetainedFiles++;}
     for(const name of ['intoParts','activate','router','connect'])assert.equal(typeof stage[name],'undefined',name);counts.historicCopiesRetained++;
     await stage.close();stage=undefined;
     await futureOriginal({api,profile,row:originalRow,request:requests[0],before:beforeOriginal,readOnly:originalReadOnly,counts,stagedReadOnlyFactory});
     await futureGeneration({api,profile,row:generationRow,request:requests[1],before:beforeGeneration,readOnly:generationReadOnly,kind,counts});
     if(kind==='retained'&&!testedTransports.has(fixture.atomic)){const retained=await api.SharedPhysicalRoomRecoveryCatalogArchive.read(manifestText,files,expected,{wasm,checkAuthority(){}});try{await probePhysicalStageFaults({api,wasm,archive:retained,requests,RecoveryLease,counts,tag:tag+'-faults'});}finally{retained.dispose();}testedTransports.add(fixture.atomic);}
     counts.cases++;
    }catch(error){throw new Error('Physical stage native case '+roomIndex+' '+kind,{cause:error});}
    finally{await stage?.discardAndClose();await catalog?.close();archive?.dispose();for(const owner of held.reverse())await owner.close();}
   }
   counts.nativeRooms++;
  }finally{profile.free();}
 }}finally{restore();}
 for(const[key,value]of Object.entries({nativeRooms:10,cases:30,longNativeCuts:1,stagedParticipants:60,coldParticipants:60,coldStages:30,historicCopiesRetained:30,exactRetainedFiles:180,duplicateWriterRefusals:30,originalSignalDetaches:30,policySnapshots:30,changedPlanRefusals:30,occupiedBeginRefusals:30,markerAloneRefusals:30,futureOriginalOwners:30,futureGenerationOwners:30,originalOperationalHandoffs:30,networkCalls:0}))assert.equal(counts[key],value,key);
 assert.ok(counts.futureDocumentComparisons>0);assert.equal(counts.futureDocumentComparisons,counts.futureReviewComparisons);
 assert.equal(counts.closedCacheReleases,1);
 assert.equal(counts.duplicateActorRefusals,30);assert.equal(counts.duplicateDestinationRefusals,30);
 assert.equal(testedTransports.size,2);assert.deepEqual(counts.faults,{sourceReentryRefusals:2,stageReentryRefusals:2,storageContextRefusals:2,sourceCloseRefusals:2,initialLostAckResumes:2,stageLostAckRetries:2,cleanupRetries:2,closeDuringRestoreResumes:2,signalAbortResumes:2,durableCorruptionRefusals:2});
 return{format:'breditor/physical-room-stage-probe',formatVersion:1,passed:true,...counts,scope:'Actual selected physical server/raster archives, original/generation client copies, private read-only native staging, cold intent and native reopening, retained historic copies, detached original signal and exact future document/review histories. Synthetic storage/locks/raster fixtures; not native-host ancestry transfer, independent comment-generation session support, provider/client closure, browser durability, authenticated activation or V1 approval.'};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('Expected normal application runtime and actual physical native fixture manifest');console.log(JSON.stringify(await probePhysicalRoomStage(process.argv[2],process.argv[3]),null,2));}
