/** Complete additional packet scope inside the metadata owner's held read.
 * Every source is restored readonly from the saved cut. Current source heads,
 * cached reports and copied ownership/permission objects never replace it. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {LocalMetadataDeliverySnapshot} from '../selected_local_metadata_delivery/contract.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import type {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {replayRetainedMetadataPacketReferences} from '../metadata_packet_replay/references.js';
import {inspectArchivedMetadataPacketOccurrences} from '../metadata_packet_replay/occurrences.js';
import {MetadataPacketArchive} from '../metadata_packet_retention/archive.js';
import {withInspectedServerPacketSource} from './inspect_source.js';
import {inspectOriginalServerPacketCatalog} from './inspect_server_packets.js';
import {inspectRecordedBaseAvailability} from './inspect_base_availability.js';
import {inspectRecordedReferenceCopy} from './inspect_reference_copy.js';
import {inspectServerPacketRasters} from './inspect_rasters.js';
import {composeServerPacketClosure} from './closure.js';
import type {ServerPacketRecoveryBundle} from './contract.js';
import type {ServerPacketRecoveryInspection} from './inspection_contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fail,same} from '../metadata_packet_retention/policy.js';
export async function inspectClientServerPacketRecovery(bundle:ServerPacketRecoveryBundle,references:LocalMetadataReferenceCut,snapshot:LocalMetadataDeliverySnapshot,current:SelectedRoomCurrentArchive,cut:PhysicalRoomRecordCutArchive,reads:Parameters<typeof replayRetainedMetadataPacketReferences>[2],host:SharedServerLogGenerationRecoveryHost,options:SharedArchiveIntegrityOptions,limits:Readonly<AssetLimits>,check:()=>void):Promise<ServerPacketRecoveryInspection>{
 check();const parent={bytes:bundle.packets.references.references.bytes,sha256:bundle.packets.references.references.sha256};let archive:MetadataPacketArchive|undefined,source:Loaded|undefined;
 try{
  await inspectRecordedReferenceCopy(bundle.packets.references,bundle.packets.containment.reconciliation.assets.references,options,check);check();
  archive=await MetadataPacketArchive.read(bundle.packets.packets,parent,options);check();const packets=archive,recorded=packets.header();
  return await withInspectedServerPacketSource({server:bundle.server,inventory:bundle.inventory,dependencies:bundle.dependencies},recorded.catalog.selection,host,options,async facts=>{
   check();const catalog=await inspectOriginalServerPacketCatalog(packets,host,options.signal,check);check();
   await inspectRecordedBaseAvailability(bundle,references,current,cut,host,options,check);check();
   source=await Loaded.read(bundle.packets.references.parent.parent.current,options);check();
   const assets={limits,...(options.signal?{signal:options.signal}:{})},requirements=await replayRetainedMetadataPacketReferences(source,packets,reads,assets,check);check();if(!same(requirements,bundle.packets.requirements))throw fail();
   const receipts=await inspectArchivedMetadataPacketOccurrences(source,packets,snapshot,reads,bundle.packets.containment,options,assets,check);check();
   if(bundle.packets.containment.kind!==(bundle.packets.containment.reconciliation.kind==='checked'&&!receipts.pendingOriginalReceipts?'contained':'pending'))throw fail();
   const closure=composeServerPacketClosure(references,recorded,requirements,facts.native,parent);if(!same(closure,bundle.closure))throw fail();check();
   const rasters=await inspectServerPacketRasters(bundle,closure,current,cut,host,options,limits,check);check();
   return frozen({format:'breditor/selected-local-server-packet-recovery-inspection',formatVersion:1,scope:'native-client-cut-exact-original-packets-complete-server-source-and-raster-data',references,requirements,source:facts,closure,originalPackets:{...catalog,...receipts},rasters,recordedReconciliation:bundle.packets.containment.reconciliation});
  });
 }finally{source?.dispose();archive?.dispose();}
}
