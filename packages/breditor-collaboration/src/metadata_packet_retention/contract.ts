/** Literal packet retention DATA. Original local journal/queue facts remain
 * in their unchanged parent files. No descriptor grants custody or activation. */
import type {OriginalMetadataPacketKind,OriginalMetadataPacket} from '../server_metadata_read/packet_contract.js';
import type {OriginalPacketFingerprint,SelectedServerMetadataCatalog} from '../server_metadata_read/contract.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
export const MAX_METADATA_PACKET_CHUNK_BYTES=64*1024*1024;
export const MAX_METADATA_PACKET_MANIFEST_BYTES=256*1024*1024;
export const MAX_METADATA_PACKET_ASSET_MANIFEST_BYTES=16*1024*1024;
export const MAX_METADATA_PACKET_BODIES=100000;
export const MAX_METADATA_PACKET_OCCURRENCES=100000;
export interface MetadataPacketFile {readonly file:Blob;readonly bytes:number;readonly sha256:string}
/** JSON-string encoding preserves the exact original JS string too, including
 * a pending local string that cannot round-trip through plain UTF-8. The packet
 * is never parsed/reformatted. Native text and storage fingerprints are distinct. */
export interface MetadataPacketBody {
 readonly key:string;readonly kind:OriginalMetadataPacketKind;
 readonly native:SharedPacketAssetIdentity;readonly fingerprint:OriginalPacketFingerprint;
 readonly encoding:'json-string-v1';readonly encodedBytes:number;readonly encodedSha256:string;
 readonly chunk:number;readonly offset:number;
}
export interface MetadataPacketLocalOccurrence {
 readonly participant:string;readonly point:string;readonly store:'versions'|'suggestions'|'revisions';
 readonly index:number;readonly body:string;readonly previousBody:string|null;
}
export interface MetadataPacketServerOccurrence {readonly kind:OriginalMetadataPacketKind;readonly id:string;readonly body:string}
export interface MetadataPacketArchiveHeader {
 readonly format:'breditor/original-metadata-packet-retention';readonly formatVersion:1;
 readonly scope:'exact-first-server-and-original-local-metadata-packet-strings';
 readonly parent:Readonly<{bytes:number;sha256:string}>;
 readonly catalog:SelectedServerMetadataCatalog<SharedServerLogGenerationRecoveryControlSelection>;
 readonly bodies:readonly MetadataPacketBody[];
 readonly server:readonly MetadataPacketServerOccurrence[];
 readonly local:readonly MetadataPacketLocalOccurrence[];
 readonly chunks:readonly Readonly<{bytes:number;sha256:string}>[];
}
export interface MetadataPacketArchiveFiles {readonly manifest:MetadataPacketFile;readonly chunks:readonly MetadataPacketFile[]}
export interface MetadataPacketBodyRead extends OriginalMetadataPacket {readonly storageKey:string;readonly native:SharedPacketAssetIdentity}

export interface MetadataPacketRequirements {
 readonly format:'breditor/original-metadata-packet-asset-references';readonly formatVersion:1;
 readonly scope:'native-exact-retained-packet-bodies';readonly document:string;
 readonly references:readonly Readonly<{asset:string;generation:string}>[];
 readonly pending:readonly Readonly<{body:string;attempts:readonly Readonly<{participant:string;missing:readonly Readonly<{writer:string;counter:string}>[]}>[]}>[];
}
export interface MetadataPacketTextCapture {readonly files:MetadataPacketArchiveFiles;readonly requirements:MetadataPacketRequirements}

/** Packet/body completeness is deliberately separate from provider-byte closure.
 * Native pending sources and earlier pending work remain explicitly recorded. */
export interface LocalMetadataPacketRetentionBundle {
 readonly format:'breditor/selected-local-metadata-packet-retention-bundle';readonly formatVersion:1;
 readonly scope:'held-original-packet-bytes-and-native-dependency-read';
 readonly references:import('../selected_local_metadata_assets/room_contract.js').LocalMetadataReferenceBundle;
 readonly containment:import('../metadata_receipt_containment/contract.js').LocalMetadataReceiptContainmentRead;
 readonly packets:MetadataPacketArchiveFiles;readonly requirements:MetadataPacketRequirements;
}
export type LocalMetadataPacketRetentionInput=import('../selected_local_metadata_assets/reconciliation_contract.js').LocalMetadataReconciliationInput;

export interface MetadataPacketAssetHeader {
 readonly format:'breditor/original-metadata-packet-assets';readonly formatVersion:1;
 readonly scope:'complete-base-packet-and-whole-upload-raster-union';
 readonly parent:Readonly<{references:Readonly<{bytes:number;sha256:string}>;packets:Readonly<{bytes:number;sha256:string}>}>;
 readonly control:SharedServerLogGenerationRecoveryControlSelection;
 readonly requirements:Readonly<{references:readonly Readonly<{asset:string;generation:string}>[];uploads:readonly string[]}>;
 readonly local:readonly import('../selected_local_metadata_assets/materialization_contract.js').LocalMetadataRasterInfo[];
 readonly provider:import('../generation_recovery_control/asset_contract.js').SharedServerLogGenerationRecoveryAssetRead;
 readonly payloads:readonly Readonly<import('../selected_local_metadata_assets/materialization_contract.js').LocalMetadataRasterInfo&{offset:number}>[];
 readonly chunks:readonly Readonly<{bytes:number;sha256:string}>[];
}
export interface MetadataPacketAssetFiles {readonly manifest:MetadataPacketFile;readonly chunks:readonly MetadataPacketFile[]}
export type MetadataPacketAssetOutcome=
 |Readonly<{kind:'retained';files:MetadataPacketAssetFiles}>
 |Readonly<{kind:'pending';missing:readonly Readonly<{kind:'native-source'|'opaque-mapping'}|{kind:'bytes';asset:string}>[]}>;

/** Additional packet dependency bytes plus the unchanged, independently selected
 * Native server/inventory files. Pending dependencies never discard these files
 * or rewrite any original packet, queue or upload acknowledgement. */
export interface LocalMetadataPacketRecoveryInput extends Omit<import('../selected_local_metadata_assets/recovery_bytes_contract.js').LocalMetadataRecoveryBytesInput,'host'> {
 readonly host:import('../generation_delivery_control/host.js').SharedServerLogGenerationDeliveryRecoveryHost;
}
export interface LocalMetadataPacketRecoveryBundle {
 readonly format:'breditor/selected-local-metadata-packet-recovery-bundle';readonly formatVersion:1;
 readonly scope:'client-metadata-first-server-packets-and-selected-recovery-files';
 readonly packets:LocalMetadataPacketRetentionBundle;
 readonly assets:MetadataPacketAssetOutcome;
 readonly server:import('../selected_local_metadata_assets/recovery_bytes_contract.js').LocalMetadataRecoveryBytesBundle['server'];
 readonly inventory:import('../selected_local_metadata_assets/recovery_bytes_contract.js').LocalMetadataRecoveryBytesBundle['inventory'];
}
export type LocalMetadataPacketRecoveryOutcome=Readonly<{kind:'retained'|'pending';bundle:LocalMetadataPacketRecoveryBundle}>;
