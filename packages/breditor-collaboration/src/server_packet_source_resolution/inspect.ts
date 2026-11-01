/** Independently reconstruct all source/raster facts from literal saved Native
 * DATA. A separately authenticated server supplies current source/provider facts. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import type {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {replayRetainedMetadataPacketReferences} from '../metadata_packet_replay/references.js';
import {MetadataPacketArchive} from '../metadata_packet_retention/archive.js';
import {inspectClientServerPacketRecovery} from '../server_packet_recovery/inspect.js';
import {withInspectedServerPacketSource} from '../server_packet_recovery/inspect_source.js';
import {inspectServerPacketRasters} from '../server_packet_recovery/inspect_rasters.js';
import {readNativeSourceVersions} from './native_versions.js';
import {resolveServerPacketSources} from './resolve.js';
import {inspectSourceResolution} from './file.js';
import type {ResolvedServerPacketRecoveryBundle,ResolvedServerPacketRecoveryInspection} from './contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
export async function inspectResolvedClientServerPacketRecovery(bundle:ResolvedServerPacketRecoveryBundle,references:LocalMetadataReferenceCut,snapshot:LocalMetadataDeliverySnapshot,current:SelectedRoomCurrentArchive,cut:PhysicalRoomRecordCutArchive,reads:Parameters<typeof replayRetainedMetadataPacketReferences>[2],host:SharedServerLogGenerationRecoveryHost,options:SharedArchiveIntegrityOptions,limits:Readonly<AssetLimits>,check:()=>void):Promise<ResolvedServerPacketRecoveryInspection>{
 check();const original=await inspectClientServerPacketRecovery(bundle.original,references,snapshot,current,cut,reads,host,options,limits,check);check();const selected=bundle.original,parent={references:{bytes:selected.packets.references.references.bytes,sha256:selected.packets.references.references.sha256},packets:{bytes:selected.packets.packets.manifest.bytes,sha256:selected.packets.packets.manifest.sha256},dependencies:{bytes:selected.dependencies.bytes,sha256:selected.dependencies.sha256}};let archive:MetadataPacketArchive|undefined,source:Loaded|undefined;
 try{
  archive=await MetadataPacketArchive.read(selected.packets.packets,parent.references,options);check();const header=archive.header();source=await Loaded.read(selected.packets.references.parent.parent.current,options);check();const versions=await readNativeSourceVersions(source,reads,{limits,...(options.signal?{signal:options.signal}:{})},check);check();
  return await withInspectedServerPacketSource({server:selected.server,inventory:selected.inventory,dependencies:selected.dependencies},header.catalog.selection,host,options,async facts=>{
   check();const resolution=resolveServerPacketSources(references,header,original.requirements,facts.native,versions,parent);await inspectSourceResolution(bundle.resolution,resolution,options);check();const rasters=await inspectServerPacketRasters({...selected,assets:bundle.assets},resolution,current,cut,host,options,limits,check);check();return frozen({format:'breditor/selected-local-resolved-server-packet-recovery-inspection',formatVersion:1,scope:'verified-source-resolution-with-original-client-pending-and-queues-preserved',original,resolution,rasters});
  });
 }finally{source?.dispose();archive?.dispose();}
}
