/** Live native/server provider checks plus real held client-native histories; never activation. */
import assert from 'node:assert/strict';
import {startNativePhysicalControls} from './fixtures/physical-recovery-control/native-host.mjs';
export async function probePhysicalRecoveryControl({api,operationProbe,root,runtime,binary,directory}){
 const native=await startNativePhysicalControls(root,binary,directory),originalFetch=globalThis.fetch,allowed=new Set(native.manifest.cases.map(row=>row.endpoint)),hosts=new Map();
 let operatorRequests=0,jointReads=0,continuedReads=0,authorReads=0,localReviewPending=0,localBlobReads=0,prototypeChecks=0,reentryRefusals=0,closeResumes=0,cancelledChecks=0,foreignRefusals=0,onToken;
 globalThis.fetch=(input,options={})=>{
  const url=String(input);
  if(url.startsWith('blob:nodedata:')){assert.equal(new Headers(options.headers).has('authorization'),false);localBlobReads++;return originalFetch(input,options);}
  assert.ok(allowed.has(url),'No editor/provider/other network request is permitted by this fixture');operatorRequests++;
  const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(input,{...options,headers});
 };
 try{
  for(const name of ['physicalRecoveryHostPort','physicalOperationalCoverage','checkPhysicalRoomNativeHost'])assert.equal(name in api,false);
  for(const row of native.manifest.cases){
   const host=await api.SharedPhysicalRoomRecoveryHost.open({endpoint:row.endpoint,expected:row.selection,principal:'operator',getToken:()=>{const action=onToken;onToken=undefined;action?.();return native.token(row.path);},checkAuthority(){}});
   assert.deepEqual(host.selection(),row.selection);hosts.set(row.path,host);
  }
  const acceptance=await operationProbe(runtime,native.path,{async onOperational({operation,phase,item,kind,fixture,resume,cohort}){
   const host=hosts.get(item.path),before=await operation.progress(),manifest=operation.manifestJson(),selection=operation.selection(),faults=cohort==='mixed'&&fixture.language===1;
   if(faults&&phase==='cold'){
    let closing;onToken=()=>{closing=operation.close();};
    await assert.rejects(operation.checkNativeHost(host),error=>error.code==='physical_operation_closed');await closing;onToken=undefined;
    operation=await api.SharedPhysicalRoomClientOperation.resume(resume);await operation.finish();assert.deepEqual(await operation.progress(),before);assert.equal(operation.manifestJson(),manifest);closeResumes++;
   }
   if(faults&&phase==='continued'){
    const stop=new AbortController();let arm=false;
    const cancelled=await api.SharedPhysicalRoomRecoveryHost.open({endpoint:item.endpoint,expected:item.selection,principal:'operator',signal:stop.signal,getToken:()=>{if(arm)stop.abort();return native.token(item.path);},checkAuthority(){}});
    try{arm=true;await assert.rejects(operation.checkNativeHost(cancelled),error=>error.code==='control_cancelled');await operation.check();assert.deepEqual(await operation.progress(),before);cancelledChecks++;}finally{cancelled.close();}
   }
   const check=await operation.checkNativeHost(host);
   assert.equal(check.format,'breditor/shared-physical-room-native-check');assert.equal(check.scope,'native-host-and-selected-client-continuity');
   if(kind==='local'){assert.equal(check.coverage.coverage.registeredStreamsCovered,false);assert.equal(check.coverage.coverage.kind,'pending');assert.ok(check.coverage.coverage.missing.some(row=>row.kind==='unbound_review'));localReviewPending++;}
   else{assert.equal(check.coverage.coverage.registeredStreamsCovered,true);assert.equal(check.coverage.coverage.kind,'covered');}
   assert.equal(check.coverage.kind,'pending','Every unselected historical copy remains explicitly unresolved');
   assert.deepEqual(check.coverage.unreconciledParticipants,before.unreconciledParticipants);assert.ok(before.unreconciledParticipants.length>0);
   assert.deepEqual(check.catalog,selection);assert.deepEqual(check.control.source,item.selection.source);assert.deepEqual(await operation.progress(),before);assert.equal(operation.manifestJson(),manifest);
   assert.ok(Object.isFrozen(check.control.source.localOrigin.native.source));assert.notDeepEqual(check.control.source.ancestor,check.control.source.localOrigin);jointReads++;if(phase==='continued')continuedReads++;if(cohort==='generation-author')authorReads++;
   if(faults&&phase==='initial'){
    const inventory=api.SharedServerLogGenerationParticipantInventory.prototype,control=api.SharedPhysicalRoomRecoveryHost.prototype;
    const previous={metadata:inventory.metadata,identity:inventory.identity,check:control.check,selection:control.selection};
    try{
     inventory.metadata=()=>{throw Error('PRIVATE-PROTOTYPE');};inventory.identity=()=>{throw Error('PRIVATE-IDENTITY');};
     control.check=()=>Promise.resolve();control.selection=()=>({verified:true});
     onToken=()=>{assert.throws(()=>operation.intoParts(),error=>error.code==='physical_operation_in_use');assert.throws(()=>operation.checkNativeHost(host),error=>error.code==='physical_operation_in_use');reentryRefusals+=2;};
     assert.deepEqual(await operation.checkNativeHost(host),check);prototypeChecks++;
    }finally{inventory.metadata=previous.metadata;inventory.identity=previous.identity;control.check=previous.check;control.selection=previous.selection;onToken=undefined;}
    const foreign=[...hosts.entries()].find(([path])=>path!==item.path)[1];
    await assert.rejects(operation.checkNativeHost(foreign),error=>error.code==='native_check_source');foreignRefusals++;
   }
   await assert.rejects(operation.checkNativeHost(Object.create(api.SharedPhysicalRoomRecoveryHost.prototype)),error=>error.code==='control_policy');await operation.check();
   return operation;
  }});
  assert.equal(jointReads,108);assert.equal(continuedReads,36);assert.equal(authorReads,18);assert.equal(localReviewPending,36);assert.ok(localBlobReads>0);
  assert.equal(prototypeChecks,6);assert.equal(reentryRefusals,12);assert.equal(closeResumes,6);assert.equal(cancelledChecks,6);assert.equal(foreignRefusals,6);assert.equal(operatorRequests,136);
  assert.equal(acceptance.cases,30);assert.equal(acceptance.participantRecordComparisons,180);assert.equal(acceptance.wholeUploadComparisons,180);assert.equal(acceptance.generationAuthors.cases,6);assert.equal(acceptance.files,180);
  return{format:'breditor/physical-recovery-control-probe',formatVersion:1,passed:true,nativeHosts:10,operatorRequests,jointReads,continuedReads,authorReads,localReviewPending,localBlobReads,prototypeChecks,reentryRefusals,closeResumes,cancelledChecks,foreignRefusals,publicFixtureFiles:native.files,credentialMaterialPersisted:false,editingTransportNetworkCalls:acceptance.networkCalls,acceptance,scope:'Genuine separately authenticated native A/B/C and server-provider checks composed with held original/generation origins and current descendants.108 joint reads include18 writable-generation-author reads, continued offline history, explicit local unbound review Pending and unresolved historic copies. Six prototype, parent-close/cold-resume, cancellation and foreign-source cohorts preserve all original files/records/uploads and future history assertions. Synthetic IndexedDB/locks/raster presentation; native control fixture histories are paragraphs with no native image dependencies. Separate native provider tests cover actual PNG/JPEG/WebP. Not full client/provider byte closure, a durable whole-room coordinator, independent comment-generation sessions, historic-copy disposition, fenced activation, browser qualification or V1 readiness.'};
 }finally{onToken=undefined;for(const host of hosts.values())host.close();globalThis.fetch=originalFetch;await native.stop();}
}
