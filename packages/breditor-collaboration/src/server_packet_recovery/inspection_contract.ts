/** Verified at-rest Native/packet/raster facts. Recorded reconciliation remains
 * historical DATA. Neither this result nor its current host observations confer
 * client ownership, a receipt/ACK, old permissions or serving/activation rights. */
import type {ServerPacketRecoveryBundle,ServerPacketClosure} from './contract.js';
import type {ServerPacketSourceInspection} from './inspect_source.js';
import type {LocalMetadataReferenceCut} from '../selected_local_metadata_assets/room_contract.js';
import type {MetadataPacketRequirements} from '../metadata_packet_retention/contract.js';
import type {LocalMetadataRasterInfo} from '../selected_local_metadata_assets/materialization_contract.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import type {SelectedRoomUploadPin} from '../selected_room_provider/contract.js';
export interface ServerPacketRecoveryInspection {
 readonly format:'breditor/selected-local-server-packet-recovery-inspection';readonly formatVersion:1;
 readonly scope:'native-client-cut-exact-original-packets-complete-server-source-and-raster-data';
 readonly references:LocalMetadataReferenceCut;readonly requirements:MetadataPacketRequirements;
 readonly source:ServerPacketSourceInspection;readonly closure:ServerPacketClosure;
 readonly originalPackets:Readonly<{pages:number;serverBodies:number;localOccurrences:number;receiptPoints:number;pendingOriginalReceipts:number}>;
 readonly rasters:Readonly<{kind:'retained';manifest:Readonly<{bytes:number;sha256:string}>;payloads:readonly LocalMetadataRasterInfo[];uploads:readonly SelectedRoomUploadPin[];provider:SharedServerLogGenerationRecoveryAssetRead}>|Readonly<{kind:'recorded-pending';missing:Extract<ServerPacketRecoveryBundle['assets'],{kind:'pending'}>['missing']}>;
 readonly recordedReconciliation:ServerPacketRecoveryBundle['packets']['containment']['reconciliation'];
}
