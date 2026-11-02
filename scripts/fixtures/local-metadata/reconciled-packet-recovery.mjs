/** Real held Native capture: complete bytes and current state keep separate meanings. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {controls} from '../selected-delivery/cold-continuation.mjs';
import {PacketRasterFixtureImage} from './packet-raster.mjs';
import {savePacketRecoveryBundle} from './packet-recovery-disk.mjs';
import {SharedRelayAssets} from '../../../packages/breditor-collaboration/dist/relay/assets.js';
import {SharedServerLogGenerationRecoveryHost as Host} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {independentHistoryNative} from '../../../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function testReconciledPacketRecovery(args,{requireCurrent}={}){
 const {scope,sources,metadata,host,check}=args,first=args.first??host.initial,fixture=args.fixture??host.fixture(first),before=metadata.recovery().current.lanes,stamps=new Map(sources.map(row=>[row.id,coreReadStamp(row.source.core)]));
 const unchanged=()=>{scope.check();check();assert.deepEqual(metadata.recovery().current.lanes,before);for(const row of sources)assert.deepEqual(coreReadStamp(row.source.core),stamps.get(row.id));};
 const image=Object.getOwnPropertyDescriptor(globalThis,'Image');Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});let current,transport,reader,cacheCalls=0;
 try{
  current=await controls(host,first,scope);unchanged();const source=sources.find(row=>row.source.parent.kind==='independent-local'),identity=independentHistoryNative(source.source.parent.session).identity,client=fixture.clients.find(row=>row.writer===identity.native.writer&&row.actor===identity.review.actor);assert.ok(client);const auth=await host.authentication(client);
  transport=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:client.principal,getToken:auth.getToken,store:{async resolve(){cacheCalls++;throw Error('No source recovery cache lookup');},async cacheRemote(){cacheCalls++;throw Error('No source recovery cache insertion');}}});
  const input={host:current.previous,inventory:current.inventory,server:current.server,transport};
  await assert.rejects(metadata.captureReconciledServerPacketRecovery({...input,claimedReady:true}));await assert.rejects(metadata.captureReconciledServerPacketRecovery({...input,host:{...input.host}}));unchanged();
  console.log('RECONCILED_RECOVERY_STEP same-reservation-byte-and-current-capture');
  const result=await metadata.captureReconciledServerPacketRecovery(input);unchanged();assert.equal(result.format,'breditor/reconciled-server-packet-recovery');assert.equal(result.recovery.kind,'retained');assert.equal(result.recovery.bundle.assets.kind,'retained');assert.equal(result.recovery.bundle.original.closure.outcome.kind,'pending');assert.equal(result.reconciliation.original.kind,'pending');
  if(requireCurrent)assert.equal(result.reconciliation.kind,requireCurrent,JSON.stringify(result.reconciliation.pending));
  assert.deepEqual(result.binding.references,{bytes:result.recovery.bundle.original.packets.references.references.bytes,sha256:result.recovery.bundle.original.packets.references.references.sha256});assert.equal(result.binding.dependencies.sha256,result.reconciliation.sources.parent.nativeResponseSha256);assert.equal(cacheCalls,0);assert.equal('activate'in result,false);assert.equal('ready'in result,false);
  const saved=await savePacketRecoveryBundle(join(host.directory,'reconciled-recovery'),result.recovery.bundle);unchanged();const replay=await host.reconstruct(current.actual);reader=await Host.open({endpoint:replay.endpoint,expected:replay.selection,principal:'operator',getToken:()=>host.operatorToken(replay),checkAuthority:unchanged,signal:scope.signal});
  console.log('RECONCILED_RECOVERY_STEP original-native-disk-inspection');const inspected=await metadata.inspectResolvedServerPacketRecovery(saved.bundle,reader);unchanged();assert.equal(inspected.rasters.kind,'retained');assert.equal(inspected.rasters.uploads.length,14);assert.equal(inspected.original.closure.outcome.kind,'pending');
  const currentFile=join(host.directory,'reconciled-current-read.json'),currentBytes=Buffer.from(JSON.stringify(result.reconciliation));writeFileSync(currentFile,currentBytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(currentFile),currentBytes);
  const report={format:'breditor/reconciled-server-packet-recovery-observation',formatVersion:1,participants:7,bytesKind:result.recovery.kind,currentKind:result.reconciliation.kind,originalKind:result.reconciliation.original.kind,binding:result.binding,currentData:{file:currentFile,bytes:currentBytes.length,sha256:sha(currentBytes)},originalMetadataLanesUnchanged:true,allNativeStampsUnchanged:true,cacheCalls,disk:saved.evidence,diskNativeInspection:true,uploadRoles:14,wholeRoomActivated:false};const file=join(host.directory,'reconciled-recovery-observation.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);console.log('RECONCILED_RECOVERY_NATIVE '+JSON.stringify({file,sha256:sha(bytes),...report}));
 }finally{reader?.close();transport?.dispose();current?.close();if(image)Object.defineProperty(globalThis,'Image',image);else delete globalThis.Image;}
}
