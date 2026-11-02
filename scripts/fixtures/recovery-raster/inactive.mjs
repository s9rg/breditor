/** Full held client capture while real native editing routes are stopped.
 * Node storage/locks/raster presentation are controlled; Rust disks, HTTP,
 * checkpoints, provider bytes and activation are genuine. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {join,dirname} from 'node:path';import {createHash} from 'node:crypto';
import {SharedDurableNativeActivationHost as Activation,SharedServerLogGenerationRecoveryHost as Inspection} from '../../../packages/breditor-collaboration/dist/index.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
import {controls} from '../selected-delivery/cold-continuation.mjs';
import {saveAndReloadRecoveryBytes} from '../local-metadata/recovery-bytes-files.mjs';
import {remotePixel} from '../local-metadata/remote-raster.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function testInactiveRecoveryRasters({metadata,scope,sources,host,first,check,native,fetchOriginal,requests,cacheCalls}){
 const stamps=new Map(sources.map(row=>[row.id,coreReadStamp(row.source.core)])),before=metadata.recovery().current.lanes;
 const unchanged=()=>{scope.check();check();assert.deepEqual(metadata.recovery().current.lanes,before);for(const row of sources)assert.deepEqual(coreReadStamp(row.source.core),stamps.get(row.id));};
 let selected,offer,current,reader,activation;const saved=globalThis.fetch;let rasterRequests=0,normalAttempts=0,commitRequests=0;const downloads=[];
 try{
  // Select an actual complete source while still serving; no normal request
  // can occur after the actual native host relinquishes serving custody.
  selected=await controls(host,first,scope);const source=selected.actual.selection.source;selected.close();selected=undefined;
  offer=await host.prepareActivation(source);unchanged();
  await assert.rejects(host.finishActivation(offer),/actual-native-service-not-committed/);
  globalThis.fetch=async(url,options={})=>{const path=new URL(String(url)).pathname;if(path.includes('/assets/')&&(options.method??'GET')==='GET'){normalAttempts++;throw Error('Normal serving endpoints unavailable before activation');}if(path.endsWith('/assets/bytes/read')){rasterRequests++;downloads.push(JSON.parse(options.body).asset);}if(path.endsWith('/native-activation/v1/commit'))commitRequests++;return saved(url,options);};
  current=await controls(host,first,scope);unchanged();assert.deepEqual(current.actual.selection.source,source);
  console.log('INACTIVE_RECOVERY_STEP normal-serving-stopped-read-only-current-controls-open');
  const beforeDownloads=rasterRequests;
  const captured=await metadata.captureRecoveryBytes({host:current.previous,transport:current.previous,server:current.server,inventory:current.inventory});unchanged();
  assert.equal(captured.kind,'ready');assert.ok(rasterRequests>beforeDownloads);assert.ok(downloads.includes('sha256:'+sha(remotePixel)),'The third raster is remote-only, absent from all fourteen managed upload archives');
  const disk=await saveAndReloadRecoveryBytes(host.directory,captured.bundle),inspected=await metadata.inspectRecoveryBytes(disk.bundle);unchanged();assert.equal(inspected.recoverable.rasters.payloads.length,3);assert.equal(normalAttempts,0);assert.equal(commitRequests,0);assert.equal(cacheCalls(),0);
  console.log('INACTIVE_RECOVERY_STEP complete-three-raster-seven-client-byte-capture-before-activation');
  // Also exercise the complete packet/native union with the same inactive
  // controller as byte transport. All original queue/ACK meanings survive.
  const recovered=await metadata.captureReconciledServerPacketRecovery({host:current.previous,transport:current.previous,server:current.server,inventory:current.inventory});unchanged();
  assert.equal(recovered.recovery.kind,'retained');assert.equal(recovered.recovery.bundle.assets.kind,'retained');assert.equal(recovered.reconciliation.original.kind,'pending');assert.equal(normalAttempts,0);assert.equal(commitRequests,0);
  const reconstructed=await host.reconstruct(current.actual);reader=await Inspection.open({endpoint:reconstructed.endpoint,expected:reconstructed.selection,principal:'operator',getToken:()=>host.operatorToken(reconstructed),checkAuthority:unchanged,signal:scope.signal});
  const packetInspection=await metadata.inspectResolvedServerPacketRecovery(recovered.recovery.bundle,reader);unchanged();assert.equal(packetInspection.rasters.kind,'retained');assert.equal(packetInspection.rasters.uploads.length,14);
  activation=Activation.configure({endpoint:offer.endpoint,expected:offer.selection,principal:'operator',getToken:()=>host.activationToken(offer),checkAuthority:unchanged,signal:scope.signal});
  unchanged();assert.equal(normalAttempts,0);const receipt=await activation.commit();unchanged();assert.equal(commitRequests,1);assert.deepEqual(receipt.selection,offer.selection);
  const served=await host.finishActivation(offer);unchanged();assert.deepEqual(served.selection.source,source);
  const file=join(host.directory,'language-3-standard-true-atomic-true','sdk-native-activation-'+offer.case.sequence+'-committed.json'),observed=JSON.parse(readFileSync(file));assert.equal(observed.actualNativeServiceRouterReturned,true);assert.deepEqual(observed.actualDeployment,offer.selection.planned);
  const report={format:'breditor/inactive-recovery-raster-observation',formatVersion:1,participants:7,uploadRoles:14,payloads:3,remoteOnlyAsset:'sha256:'+sha(remotePixel),rasterRequests,normalAttempts,commitRequests,readOnlyCaptureBeforeActivation:true,completePacketRecovery:true,actualInactiveNativeInspection:true,nativeStampsUnchanged:true,metadataLanesUnchanged:true,cacheCalls:cacheCalls(),actualEpochAdvancedOnce:true,files:disk.files,wholeRoomActivated:false};
  const reportFile=join(host.directory,'inactive-recovery-rasters.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');writeFileSync(reportFile,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(reportFile),bytes);console.log('INACTIVE_RECOVERY_NATIVE '+JSON.stringify({file:reportFile,sha256:sha(bytes),...report}));
 }finally{globalThis.fetch=saved;activation?.close();reader?.close();current?.close();selected?.close();}
}
