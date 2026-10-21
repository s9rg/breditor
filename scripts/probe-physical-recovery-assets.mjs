/** Genuine native image bindings and held original/generation upload snapshots. Never activation. */
import assert from 'node:assert/strict';
import {startNativePhysicalControls} from './fixtures/physical-recovery-control/native-host.mjs';
import {pixelAsset,secondAsset} from './fixtures/review-assets/pixels.mjs';
export async function probePhysicalRecoveryAssets({api,operationProbe,root,runtime,binary,directory}){
 const native=await startNativePhysicalControls(root,binary,directory),originalFetch=globalThis.fetch,allowed=new Set(native.manifest.cases.flatMap(row=>[row.endpoint,row.endpoint.replace(/\/check$/,'/assets/check')])),hosts=new Map();
 let operatorRequests=0,assetRequests=0,lateClosedAssetRequests=0,closingRead=false,jointReads=0,continuedReads=0,authorReads=0,localReviewPending=0,localBlobReads=0,prototypeChecks=0,reentryRefusals=0,closeResumes=0,cancelledChecks=0,foreignRefusals=0,onToken;
 globalThis.fetch=(input,options={})=>{
  const url=String(input);
  if(url.startsWith('blob:nodedata:')){assert.equal(new Headers(options.headers).has('authorization'),false);localBlobReads++;return originalFetch(input,options);}
  assert.ok(allowed.has(url),'Only the test-owned operator continuity and asset read routes are allowed');operatorRequests++;if(url.endsWith('/assets/check')){assetRequests++;if(closingRead)lateClosedAssetRequests++;}
  const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(input,{...options,headers});
 };
 try{
  for(const name of ['physicalRecoveryHostPort','checkPhysicalRoomNativeAssets','physicalOperationalCoverage'])assert.equal(name in api,false);
  for(const row of native.manifest.cases){const host=await api.SharedPhysicalRoomRecoveryHost.open({endpoint:row.endpoint,expected:row.selection,principal:'operator',getToken:()=>{const action=onToken;onToken=undefined;action?.();return native.token(row.path);},checkAuthority(){}});hosts.set(row.path,host);}
  const acceptance=await operationProbe(runtime,native.path,{async onOperational({operation,phase,item,kind,fixture,resume,cohort}){
   const host=hosts.get(item.path),before=await operation.progress(),manifest=operation.manifestJson(),selection=operation.selection(),faults=cohort==='mixed'&&fixture.language===1;
   if(faults&&phase==='cold'){
    let closing;onToken=()=>{closingRead=true;closing=operation.close();};
    await assert.rejects(operation.checkNativeAssets(host),error=>error.code==='physical_operation_closed');await closing;onToken=undefined;closingRead=false;
    operation=await api.SharedPhysicalRoomClientOperation.resume(resume);await operation.finish();assert.deepEqual(await operation.progress(),before);assert.equal(operation.manifestJson(),manifest);closeResumes++;
   }
   if(faults&&phase==='continued'){
    const stop=new AbortController();let arm=false;
    const cancelled=await api.SharedPhysicalRoomRecoveryHost.open({endpoint:item.endpoint,expected:item.selection,principal:'operator',signal:stop.signal,getToken:()=>{if(arm)stop.abort();return native.token(item.path);},checkAuthority(){}});
    try{arm=true;await assert.rejects(operation.checkNativeAssets(cancelled),error=>error.code==='control_cancelled');await operation.check();assert.deepEqual(await operation.progress(),before);cancelledChecks++;}finally{cancelled.close();}
   }
   const check=await operation.checkNativeAssets(host);
   assert.equal(check.format,'breditor/shared-physical-room-native-assets-check');assert.equal(check.scope,'held-client-native-packets-whole-uploads-and-current-provider-bytes');
   assert.equal(check.kind,'pending');assert.equal(check.assets.kind,'pending','Available provider bytes cannot settle pending/cancelled local queue work');
   assert.deepEqual(check.assets.dependencies,[],'The complete native fixture packets and version cuts must be inspectable');
   assert.ok(check.assets.provider);const provider=check.assets.provider;
   assert.equal(provider.scope,'server-and-declared-client-binding-and-upload-bytes');assert.deepEqual(provider.selection,item.selection);assert.deepEqual(provider.missing,[]);
   assert.deepEqual(provider.assets.map(row=>row.asset).sort(),[pixelAsset,secondAsset].sort());
   for(const row of provider.assets){assert.equal(row.mime,'image/png');assert.equal(row.width,1);assert.equal(row.height,1);assert.ok(row.bytes>0);}
   assert.ok(provider.resolutions.some(row=>row.reference.asset===pixelAsset&&row.reference.generation==='native-image-binding'&&row.contentAsset===pixelAsset));
   assert.equal(check.assets.uploads.length,2);assert.equal(check.assets.pendingUploads.length,4);
   for(const snapshot of check.assets.uploads){assert.ok(['original','generation'].includes(snapshot.family));assert.match(snapshot.sha256,/^[a-f0-9]{64}$/);assert.ok(snapshot.bytes>0);assert.deepEqual(snapshot.records.map(row=>row.asset).sort(),[pixelAsset,secondAsset].sort());for(const record of snapshot.records){assert.ok(['pending','cancelled'].includes(record.status));assert.equal('receipt' in record,false);assert.equal('failure' in record,false);}}
   assert.equal(check.assets.pendingUploads.filter(row=>row.status==='cancelled').length,2,'Both original and generation fixture stores explicitly cancel the second PNG');assert.ok(Object.isFrozen(check.assets.uploads[0].records));
   if(kind==='local'){assert.equal(check.coverage.coverage.registeredStreamsCovered,false);assert.ok(check.coverage.coverage.missing.some(row=>row.kind==='unbound_review'));localReviewPending++;}else assert.equal(check.coverage.coverage.registeredStreamsCovered,true);
   assert.equal(check.coverage.kind,'pending');assert.deepEqual(check.coverage.unreconciledParticipants,before.unreconciledParticipants);assert.ok(before.unreconciledParticipants.length>0);
   assert.deepEqual(check.catalog,selection);assert.deepEqual(check.control.source,item.selection.source);assert.deepEqual(await operation.progress(),before);assert.equal(operation.manifestJson(),manifest);jointReads++;if(phase==='continued')continuedReads++;if(cohort==='generation-author')authorReads++;
   if(faults&&phase==='initial'){
    const control=api.SharedPhysicalRoomRecoveryHost.prototype,previous=control.checkAssets;
    try{control.checkAssets=()=>Promise.resolve({verified:true});onToken=()=>{assert.throws(()=>operation.intoParts(),error=>error.code==='physical_operation_in_use');assert.throws(()=>operation.checkNativeAssets(host),error=>error.code==='physical_operation_in_use');reentryRefusals+=2;};assert.deepEqual(await operation.checkNativeAssets(host),check);prototypeChecks++;}
    finally{control.checkAssets=previous;onToken=undefined;}
    const foreign=[...hosts.entries()].find(([path])=>path!==item.path)[1];await assert.rejects(operation.checkNativeAssets(foreign),error=>error.code==='native_check_source');foreignRefusals++;
   }
   await assert.rejects(operation.checkNativeAssets(Object.create(api.SharedPhysicalRoomRecoveryHost.prototype)),error=>error.code==='control_policy');await operation.check();return operation;
  }});
  assert.equal(jointReads,108);assert.equal(continuedReads,36);assert.equal(authorReads,18);assert.equal(localReviewPending,36);assert.ok(localBlobReads>0);assert.equal(prototypeChecks,6);assert.equal(reentryRefusals,12);assert.equal(closeResumes,6);assert.equal(cancelledChecks,6);assert.equal(foreignRefusals,6);assert.equal(operatorRequests,136);assert.equal(assetRequests,120);assert.equal(lateClosedAssetRequests,6,'A closed parent must reject even a genuine native read that finishes after close');
  assert.equal(acceptance.cases,30);assert.equal(acceptance.participantRecordComparisons,180);assert.equal(acceptance.wholeUploadComparisons,180);assert.equal(acceptance.generationAuthors.cases,6);assert.equal(acceptance.files,180);
  return{format:'breditor/physical-recovery-assets-probe',formatVersion:1,passed:true,nativeHosts:10,operatorRequests,assetRequests,lateClosedAssetRequests,jointReads,continuedReads,authorReads,localReviewPending,localBlobReads,prototypeChecks,reentryRefusals,closeResumes,cancelledChecks,foreignRefusals,publicFixtureFiles:native.files,credentialMaterialPersisted:false,editingTransportNetworkCalls:acceptance.networkCalls,acceptance,scope:'Actual native image bindings and two native PNG payloads (including an unreferenced upload) reconcile with genuine held original/generation packet histories and complete upload archives.108 reads retain Pending/cancelled queue work, historic copies and unbound local review;180 original file, record and upload comparisons plus writable authors and future Undo/Redo remain unchanged. Synthetic client storage/locks/raster presentation; not durable whole-room coordination, independent comment generations, historic-copy disposition, fenced activation, browser qualification or V1 approval.'};
 }finally{onToken=undefined;for(const host of hosts.values())host.close();globalThis.fetch=originalFetch;await native.stop();}
}
