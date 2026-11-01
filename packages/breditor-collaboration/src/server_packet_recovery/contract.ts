/** Separate whole server/client packet scope. Original client diagnostics,
 * catalog receipts and pending outboxes keep their literal original meaning. */
import type {MetadataPacketFile,LocalMetadataPacketRetentionBundle,LocalMetadataPacketRecoveryInput,MetadataPacketAssetFiles,MetadataPacketAssetHeader} from '../metadata_packet_retention/contract.js';
import type {ServerNativePacketSource} from '../server_native_dependencies/contract.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
export type ServerPacketRecoveryInput=LocalMetadataPacketRecoveryInput;
export interface ServerPacketCoverage {readonly body:string;readonly source:ServerNativePacketSource;readonly relation:'original-packet'|'derived-revision-child'}
export interface ServerPacketClosure {
 readonly format:'breditor/client-and-complete-server-native-reference-closure';readonly formatVersion:1;
 readonly scope:'base-history-declared-packet-bodies-and-complete-server-physical-native';
 readonly covered:readonly ServerPacketCoverage[];
 readonly outcome:Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:'pending';missing:readonly Readonly<{kind:'base-history'|'server-native'}|{kind:'packet-source';body:string}>[]}>;
}
export interface ServerPacketAssetHeader extends Omit<MetadataPacketAssetHeader,'format'|'scope'|'parent'> {
 readonly format:'breditor/client-and-server-native-packet-assets';readonly scope:'complete-client-server-native-and-whole-upload-raster-union';
 readonly parent:MetadataPacketAssetHeader['parent']&Readonly<{dependencies:Readonly<{bytes:number;sha256:string}>}>;
}
export type ServerPacketAssetOutcome=Readonly<{kind:'retained';files:MetadataPacketAssetFiles}>|Readonly<{kind:'pending';missing:readonly Readonly<{kind:'native-source'|'opaque-mapping'}|{kind:'bytes';asset:string}>[]}>;
export interface ServerPacketRecoveryBundle {
 readonly format:'breditor/selected-local-server-packet-recovery-bundle';readonly formatVersion:1;
 readonly scope:'client-history-original-packets-complete-server-native-and-selected-files';
 readonly packets:LocalMetadataPacketRetentionBundle;
 readonly dependencies:MetadataPacketFile;readonly closure:ServerPacketClosure;readonly assets:ServerPacketAssetOutcome;
 readonly server:import('../metadata_packet_retention/contract.js').LocalMetadataPacketRecoveryBundle['server'];
 readonly inventory:import('../metadata_packet_retention/contract.js').LocalMetadataPacketRecoveryBundle['inventory'];
}
export type ServerPacketRecoveryOutcome=Readonly<{kind:'retained'|'pending';bundle:ServerPacketRecoveryBundle}>;
