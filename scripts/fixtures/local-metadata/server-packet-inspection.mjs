/** Complete actual seven-family capture, disk readback and real Native server
 * reconstruction before comparison. The owner remains quiescent and all later
 * document/review Undo/Redo checks in the original workflow still run. */
import assert from 'node:assert/strict';import {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {PacketRasterFixtureImage} from './packet-raster.mjs';
import {checkCompleteInspectionRefusals} from './complete-inspection-cases.mjs';
import {testServerPacketRecovery} from './server-packet-recovery.mjs';
import {SharedServerLogGenerationRecoveryHost as Host} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {withInspectedServerPacketSource} from '../../../packages/breditor-collaboration/dist/server_packet_recovery/inspect_source.js';
import {inspectMetadataPacketIdentities} from '../../../packages/breditor-collaboration/dist/server_packet_recovery/inspect_packet_identities.js';
import {inspectOriginalServerPacketCatalog} from '../../../packages/breditor-collaboration/dist/server_packet_recovery/inspect_server_packets.js';
import {MetadataPacketArchive} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
import {coreReadStamp} from '../../../packages/breditor-collaboration/dist/core_read_stamp.js';
import * as wasm from '../../../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
export async function testServerPacketInspection(args){
 const {bundle,selected}=await testServerPacketRecovery(args),{scope,sources,host,metadata,check}=args;
 const stamps=sources.map(row=>({id:row.id,stamp:coreReadStamp(row.source.core)})),lanes=metadata.recovery().current.lanes;
 const unchanged=()=>{check();scope.check();for(const row of sources)assert.deepEqual(coreReadStamp(row.source.core),stamps.find(item=>item.id===row.id).stamp);assert.deepEqual(metadata.recovery().current.lanes,lanes);};
 let reader,archive;const image=Object.getOwnPropertyDescriptor(globalThis,'Image');Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});
 try{
  unchanged();const reconstructed=await host.reconstruct(selected);unchanged();
  reader=await Host.open({endpoint:reconstructed.endpoint,expected:reconstructed.selection,principal:'operator',getToken:()=>host.operatorToken(reconstructed),checkAuthority:unchanged,signal:scope.signal});
  const options={wasm,signal:scope.signal,checkAuthority:unchanged},files={server:bundle.server,inventory:bundle.inventory,dependencies:bundle.dependencies};
  archive=await MetadataPacketArchive.read(bundle.packets.packets,{bytes:bundle.packets.references.references.bytes,sha256:bundle.packets.references.references.sha256},options);unchanged();
  console.log('COMPLETE_PACKET_INSPECTION_STEP actual-owner-public-inspector');const complete=await metadata.inspectServerPacketRecovery(bundle,reader);unchanged();assert.equal(complete.rasters.kind,'retained');assert.equal(complete.rasters.payloads.length,4);assert.equal(complete.rasters.uploads.length,14);assert.equal(complete.originalPackets.localOccurrences,82);assert.equal(complete.originalPackets.serverBodies,17);assert.deepEqual(complete.requirements,bundle.packets.requirements);assert.deepEqual(complete.closure,bundle.closure);console.log('COMPLETE_PACKET_INSPECTION_STEP all-native-packet-receipt-and-raster-facts-verified');
  console.log('COMPLETE_PACKET_INSPECTION_STEP genuine-owner-refusals');const refusals=await checkCompleteInspectionRefusals({metadata,scope,unchanged,bundle,reader});unchanged();
  const source=await withInspectedServerPacketSource(files,archive.header().catalog.selection,reader,options,async facts=>{
   assert.equal(await inspectMetadataPacketIdentities(archive,sources[0].source.core,unchanged),archive.header().bodies.length);unchanged();
   const catalog=await inspectOriginalServerPacketCatalog(archive,reader,scope.signal,unchanged);unchanged();return{facts,catalog};
  });unchanged();
  assert.equal(source.facts.native.outcome.kind,'ready');assert.equal(source.catalog.serverBodies,archive.header().server.length);assert.ok(source.facts.native.sources.length>0);
  const report={format:'breditor/server-packet-inspection-whole-cohort-observation',formatVersion:1,participants:7,serverNativeSources:source.facts.native.sources.length,serverNativeReferences:source.facts.native.outcome.references.length,catalog:source.catalog,originalSelection:source.facts.recordedSelection,reconstructedSelection:source.facts.selection,allNativeStampsUnchanged:true,originalMetadataLanesUnchanged:true,serverBytesReplayed:true,completeRecordedNativeCompared:true,exactOriginalServerPacketsCompared:true,completePortableClientInspection:true,refusals,wholeRoomActivated:false};
  const file=join(host.directory,'server-packet-inspection-whole-cohort-observation.json'),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');writeFileSync(file,bytes,{flag:'wx',mode:0o600});assert.deepEqual(readFileSync(file),bytes);console.log('SERVER_PACKET_INSPECTION_COHORT '+JSON.stringify({file,sha256:createHash('sha256').update(bytes).digest('hex'),participants:7,...source.catalog}));
 }finally{archive?.dispose();reader?.close();if(image)Object.defineProperty(globalThis,'Image',image);else delete globalThis.Image;}
}
