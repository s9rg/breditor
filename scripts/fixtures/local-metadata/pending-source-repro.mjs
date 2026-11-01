/** Actual uncached catalog DATA and complete current server knowledge disagree
 * only about the selected recovery scope. No owner or registration is fabricated. */
import assert from 'node:assert/strict';import {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';
import {controls} from '../selected-delivery/cold-continuation.mjs';
import {SharedRelayAssets} from '../../../packages/breditor-collaboration/dist/relay/assets.js';
import {independentHistoryNative} from '../../../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
import {MetadataPacketArchive} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
import {savePacketRecoveryBundle} from './packet-recovery-disk.mjs';
import {PacketRasterFixtureImage} from './packet-raster.mjs';
import * as wasm from '../../../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
export async function reproducePendingSource(args){
 const {metadata,scope,sources,check,host,first,fixture,available}=args;
 const before=metadata.recovery().current.lanes,stamps=sources.map(row=>({id:row.id,stamp:coreReadStamp(row.source.core)})),guard=()=>{scope.check();check();assert.deepEqual(metadata.recovery().current.lanes,before);for(const row of sources)assert.deepEqual(coreReadStamp(row.source.core),stamps.find(value=>value.id===row.id).stamp);};
 guard();assert.equal(available.availability.kind,'pending');assert.equal(available.availability.provider,null);
 const base=JSON.parse(await available.references.references.file.text());assert.equal(base.outcome.kind,'pending');const missing=[...new Set(base.outcome.pending.flatMap(row=>row.kind==='metadata'?row.pending.filter(value=>value.kind==='uncached_version').map(value=>value.id):[]))];assert.ok(missing.length);guard();
 let current,transport,archive;let cacheCalls=0;const image=Object.getOwnPropertyDescriptor(globalThis,'Image');Object.defineProperty(globalThis,'Image',{value:PacketRasterFixtureImage,configurable:true});
 try{
  current=await controls(host,first,scope);guard();const original=sources.find(row=>row.source.parent.kind==='independent-local'),identity=independentHistoryNative(original.source.parent.session).identity,client=fixture.clients.find(row=>row.writer===identity.native.writer&&row.actor===identity.review.actor);assert.ok(client);const auth=await host.authentication(client);
  transport=new SharedRelayAssets({endpoint:first.clientEndpoint,principal:client.principal,getToken:auth.getToken,store:{async resolve(){cacheCalls++;throw Error('No cache lookup during source proof');},async cacheRemote(){cacheCalls++;throw Error('No cache insertion during source proof');}}});
  console.log('PENDING_SOURCE_REPRO_STEP capture-real-uncached-version-and-selected-server');const outcome=await metadata.captureServerPacketRecovery({host:current.previous,inventory:current.inventory,server:current.server,transport});guard();
  assert.equal(outcome.kind,'pending');const bundle=outcome.bundle;assert.equal(bundle.closure.outcome.kind,'pending');assert.ok(bundle.closure.outcome.missing.some(row=>row.kind==='base-history'));assert.equal(bundle.assets.kind,'pending');assert.deepEqual(bundle.assets.missing,[{kind:'native-source'}]);
  const actual=JSON.parse(await bundle.dependencies.file.text());assert.equal(actual.native.outcome.kind,'ready');for(const id of missing)assert.ok(actual.native.sources.some(row=>row.packet.kind==='version'&&row.packet.id===id),'The current genuine server retains the supposedly missing immutable version');
  archive=await MetadataPacketArchive.read(bundle.packets.packets,{bytes:bundle.packets.references.references.bytes,sha256:bundle.packets.references.references.sha256},{wasm,signal:scope.signal,checkAuthority:guard});for(const id of missing)assert.ok(archive.header().server.some(row=>row.kind==='version'&&row.id===id));
  const saved=await savePacketRecoveryBundle(join(host.directory,'pending-source-recovery'),bundle);guard();assert.equal(cacheCalls,0);const report={format:'breditor/uncached-version-source-gap-reproduction',formatVersion:1,participants:sources.length,uncachedVersions:missing,baseHistoryKind:base.base.history.kind,unreconciledParticipants:base.base.unreconciledParticipants,originalPendingPreserved:true,serverNativeKind:actual.native.outcome.kind,allMissingVersionsRetainedByActualServer:true,allMissingVersionPacketsCaptured:true,oldCombinedClosure:bundle.closure.outcome,originalRasterOutcome:bundle.assets,cacheCalls,allNativeStampsAndOriginalMetadataLanesUnchanged:true,wholeRoomActivated:false,disk:saved.evidence};
  const file=join(host.directory,'pending-source-repro.json');writeFileSync(file,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});assert.deepEqual(JSON.parse(readFileSync(file)),report);
  const publicFixture={configuration:fixture.configuration,clients:fixture.clients.map(({writer,actor,principal,documentCheckpoint})=>({writer,actor,principal,documentCheckpoint}))};writeFileSync(join(host.directory,'pending-source-native-fixture.json'),JSON.stringify(publicFixture)+'\n',{flag:'wx',mode:0o600});
  console.log('PENDING_SOURCE_REPRO '+JSON.stringify({file,participants:sources.length,uncachedVersions:missing.length,baseHistoryKind:base.base.history.kind,unreconciledParticipants:base.base.unreconciledParticipants,serverNativeKind:'ready',oldCombinedClosure:'pending',cacheCalls,NativeAndOriginalMetadataUnchanged:true,diskIndex:saved.evidence.index}));
 }finally{archive?.dispose();transport?.dispose();current?.close();if(image)Object.defineProperty(globalThis,'Image',image);else delete globalThis.Image;}
}
