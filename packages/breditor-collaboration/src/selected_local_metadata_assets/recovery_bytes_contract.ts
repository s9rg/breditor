/** Portable client/native/metadata/asset and actual selected server files.
 * Complete bytes are DATA, not accepted-head agreement or activation rights. */
import type {LocalMetadataAssetAvailabilityHost} from './availability_host.js';
import type {SharedRelayAssets} from '../relay/assets.js';
import type {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import type {SharedServerLogGenerationRoomBackupIdentity} from '../server_generation_archive/contract.js';
import type {SharedServerLogGenerationParticipantIdentity} from '../server_generation_inventory/contract.js';
import type {LocalMetadataMaterializationOptions} from './materialization_contract.js';
import type {LocalMetadataRecoverableBundle,LocalMetadataRecoverableInspection,LocalMetadataRecoverableOutcome} from './recoverable_contract.js';
export interface LocalMetadataRecoveryBytesInput extends LocalMetadataMaterializationOptions {
 readonly host:LocalMetadataAssetAvailabilityHost;readonly transport:SharedRelayAssets;
 readonly server:SharedServerLogGenerationRoomArchive;
 readonly inventory:SharedServerLogGenerationParticipantInventory;
}
export interface LocalMetadataRecoveryBytesBundle {
 readonly format:'breditor/selected-local-metadata-recovery-bytes-bundle';readonly formatVersion:1;
 readonly scope:'complete-client-metadata-assets-and-selected-server-files';
 readonly recoverable:LocalMetadataRecoverableBundle;
 readonly server:Readonly<{file:Blob;bytes:number;sha256:string;identity:SharedServerLogGenerationRoomBackupIdentity}>;
 readonly inventory:Readonly<{file:Blob;bytes:number;sha256:string;identity:SharedServerLogGenerationParticipantIdentity}>;
}
export type LocalMetadataRecoveryBytesOutcome=Readonly<{kind:'ready';bundle:LocalMetadataRecoveryBytesBundle}>|Extract<LocalMetadataRecoverableOutcome,{kind:'pending'}>;
/** Client history is Native-replayed. Server bytes are independently selected
 * and hashed; this does not replay a new server inside the browser or revive
 * the historical controller, protected credentials or a serving role. */
export interface LocalMetadataRecoveryBytesInspection {
 readonly format:'breditor/selected-local-metadata-recovery-bytes-inspection';readonly formatVersion:1;
 readonly scope:'native-client-cut-and-recorded-server-byte-selection';
 readonly recoverable:LocalMetadataRecoverableInspection;
 readonly server:Readonly<{identity:SharedServerLogGenerationRoomBackupIdentity;bytes:number;sha256:string;nativeBytes:number;rasterArchiveBytes:number}>;
 readonly inventory:Readonly<{identity:SharedServerLogGenerationParticipantIdentity;bytes:number;sha256:string}>;
}
