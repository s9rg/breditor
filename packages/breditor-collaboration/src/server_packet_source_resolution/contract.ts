/** Additional Native source knowledge preserves every original Pending result.
 * It is neither a cache/download acknowledgement nor current client custody. */
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {ServerNativePacketSource} from '../server_native_dependencies/contract.js';
import type {ServerPacketRecoveryBundle,ServerPacketAssetOutcome} from '../server_packet_recovery/contract.js';
import type {MetadataPacketRequirements} from '../metadata_packet_retention/contract.js';
import type {SharedPacketAssetIdentity} from '../packet_asset_references.js';
import type {MetadataPacketFile} from '../metadata_packet_retention/contract.js';
import type {ServerPacketRecoveryInspection} from '../server_packet_recovery/inspection_contract.js';
export interface NativeSourceVersionKnowledge {
 readonly format:'breditor/retained-native-source-version-knowledge';readonly formatVersion:1;
 readonly scope:'all-selected-readonly-native-source-version-packets';readonly document:string;
 readonly versions:readonly Readonly<{participant:string;id:string;references:readonly RichRetainedAssetReference[]}>[];
 readonly references:readonly RichRetainedAssetReference[];
}
export type OriginalSourceRequirement=Readonly<{kind:'original-pending';participant:string;path:string;pending:SharedAssetCapturePending}>;
/** A retained body's complete original Native attempt matrix stays literal. */
export type PacketSourceRequirement=OriginalSourceRequirement|Readonly<{kind:'retained-body';body:string;packet:SharedPacketAssetIdentity;attempts:MetadataPacketRequirements['pending'][number]['attempts']}>;
export type PacketSourceWitness=
 |Readonly<{kind:'retained-packet';body:string}>
 |Readonly<{kind:'native-source-version';id:string;participants:readonly string[]}>
 |Readonly<{kind:'server-packet';source:ServerNativePacketSource;relation:'original-packet'|'derived-revision-child'}>;
export interface ServerPacketSourceResolution {
 readonly format:'breditor/client-server-native-source-resolution';readonly formatVersion:1;
 readonly scope:'complete-held-native-and-declared-packet-reference-knowledge-preserving-original-pending';
 readonly parent:Readonly<{references:Readonly<{bytes:number;sha256:string}>;packets:Readonly<{bytes:number;sha256:string}>;dependencies:Readonly<{bytes:number;sha256:string}>}>;
 readonly nativeVersions:NativeSourceVersionKnowledge;
 readonly covered:readonly Readonly<{requirement:PacketSourceRequirement;witness:PacketSourceWitness}>[];
 readonly outcome:Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:'pending';missing:readonly Readonly<{kind:'server-native'}|{kind:'unreconciled-client';participant:string}|{kind:'requirement';requirement:PacketSourceRequirement}>[]}>;
}
export interface ResolvedServerPacketRecoveryBundle {
 readonly format:'breditor/selected-local-resolved-server-packet-recovery-bundle';readonly formatVersion:1;
 readonly scope:'literal-original-recovery-plus-verified-native-source-and-raster-resolution';
 readonly original:ServerPacketRecoveryBundle;readonly resolution:MetadataPacketFile;readonly assets:ServerPacketAssetOutcome;
}
export type ResolvedServerPacketRecoveryOutcome=Readonly<{kind:'retained'|'pending';bundle:ResolvedServerPacketRecoveryBundle}>;
export interface ResolvedServerPacketRecoveryInspection {
 readonly format:'breditor/selected-local-resolved-server-packet-recovery-inspection';readonly formatVersion:1;
 readonly scope:'verified-source-resolution-with-original-client-pending-and-queues-preserved';
 readonly original:ServerPacketRecoveryInspection;readonly resolution:ServerPacketSourceResolution;
 readonly rasters:ServerPacketRecoveryInspection['rasters'];
}
