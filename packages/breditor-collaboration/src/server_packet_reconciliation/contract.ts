/** Current same-owner DATA. Server reference knowledge does not acknowledge
 * client downloads, settle queues, retain a backup or grant activation. */
import type {LocalMetadataReconciliationInput,LocalMetadataReconciliationRead,LocalMetadataReconciliationPending} from '../selected_local_metadata_assets/reconciliation_contract.js';
import type {SharedServerLogGenerationRecoveryAssetRead,SharedServerLogGenerationRecoveryAssetRequirements} from '../generation_recovery_control/asset_contract.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SelectedServerNativeDependencies} from '../server_native_dependencies/contract.js';
import type {NativeSourceVersionKnowledge,PacketSourceRequirement,PacketSourceWitness} from '../server_packet_source_resolution/contract.js';
import type {MetadataPacketBody,MetadataPacketRequirements} from '../metadata_packet_retention/contract.js';
import type {SelectedRoomUploadPin} from '../selected_room_provider/contract.js';
import type {RichRetainedAssetReference} from '@breditor/experimental-rich-content';
export interface CurrentLocalPacketReferences {
 readonly format:'breditor/current-held-local-packet-references';readonly formatVersion:1;
 readonly scope:'original-retained-local-packet-strings-at-every-held-metadata-point';
 readonly occurrences:number;readonly bodies:readonly Pick<MetadataPacketBody,'key'|'kind'|'native'>[];
 readonly requirements:MetadataPacketRequirements;
}
export interface CurrentServerPacketSourceRead {
 readonly format:'breditor/current-server-packet-reference-read';readonly formatVersion:1;
 readonly scope:'held-histories-local-packets-source-versions-and-complete-server-native';
 readonly parent:Readonly<{references:Readonly<{bytes:number;sha256:string}>;nativeResponseSha256:string}>;
 readonly native:SelectedServerNativeDependencies<SharedServerLogGenerationRecoveryControlSelection>;
 readonly local:CurrentLocalPacketReferences;readonly nativeVersions:NativeSourceVersionKnowledge;
 readonly covered:readonly Readonly<{requirement:PacketSourceRequirement;witness:PacketSourceWitness}>[];
 readonly outcome:Readonly<{kind:'ready';references:readonly RichRetainedAssetReference[]}>|Readonly<{kind:'pending';missing:readonly Readonly<{kind:'server-native'}|{kind:'unreconciled-client';participant:string}|{kind:'requirement';requirement:PacketSourceRequirement}>[]}>;
}
export type ServerPacketReconciliationInput=LocalMetadataReconciliationInput;
export type ServerPacketReconciliationPending=
 |Readonly<{kind:'original';requirement:Exclude<LocalMetadataReconciliationPending,Readonly<{kind:'references'|'provider'}>>}>
 |Readonly<{kind:'sources'}>|Readonly<{kind:'provider'}>;
export interface ServerPacketReconciliationRead {
 readonly format:'breditor/selected-local-server-packet-reconciliation-read';readonly formatVersion:1;
 readonly scope:'current-held-native-all-metadata-complete-server-source-and-provider';
 readonly kind:'checked'|'pending';readonly original:LocalMetadataReconciliationRead;
 readonly sources:CurrentServerPacketSourceRead;
 readonly currentProvider:Readonly<{requirements:SharedServerLogGenerationRecoveryAssetRequirements;uploads:readonly SelectedRoomUploadPin[];read:SharedServerLogGenerationRecoveryAssetRead}>|null;
 readonly pending:readonly ServerPacketReconciliationPending[];
}
