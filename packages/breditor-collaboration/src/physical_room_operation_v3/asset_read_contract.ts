/** Internal genuine-root file capture. Data pins are not transferable ownership,
 * current provider evidence, registered-stream coverage or activation permission. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {PhysicalOperationV3Family} from './contract.js';
import type {PhysicalRoomCatalogV3Selection} from '../physical_room_catalog_v3/contract.js';
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
export interface PhysicalAssetSourcePin {
 readonly operationDatabase:string;readonly catalogDatabase:string;
 readonly catalog:PhysicalRoomCatalogV3Selection;readonly intentSha256:string;
}
export interface PhysicalAssetNativePin {
 readonly document:Readonly<{kind:'original'|'segmented-v1';sha256:string}>;
 readonly review:Readonly<{kind:'original'|'segmented-v1';sha256:string}>|Readonly<{kind:'absent'}>|Readonly<{kind:'unselected';nativeKind:'original'|'segmented-v1'}>;
}
export interface PhysicalAssetReadParticipant {
 readonly id:string;readonly family:PhysicalOperationV3Family;readonly sourceDatabase:string;
 readonly native:PhysicalAssetNativePin;readonly limits:Readonly<AssetLimits>;
 readonly uploads:Blob;readonly uploadsSha256:string;
}
export interface PhysicalAssetReadScope {
 readonly source:PhysicalAssetSourcePin;readonly namespaces:readonly string[];
 readonly participants:readonly PhysicalAssetReadParticipant[];
 readonly unreconciledParticipants:readonly string[];
 check():void;
 digest(file:Blob):Promise<string>;
}
/** Initial selections can retain the exact owned buffer that matched their pin. */
export interface PhysicalAssetSelectionScope extends PhysicalAssetReadScope {
 readonly readAndDigest:ArchiveIntegrityContext['readAndDigest'];
}
export interface PhysicalAssetReadOptions {readonly checkAuthority:()=>void;readonly signal?:AbortSignal}
