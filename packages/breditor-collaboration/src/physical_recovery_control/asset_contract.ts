/** New read-only requirement scope. Bindings and unreferenced uploads have different identities. */
import type {SharedPhysicalRecoveryControlSelection} from './contract.js';
export const MAX_PHYSICAL_RECOVERY_ASSET_BYTES=32*1024*1024;
export const MAX_PHYSICAL_RECOVERY_ASSET_REQUIREMENTS=100000;
export interface SharedPhysicalRecoveryAssetReference {readonly asset:string;readonly generation:string}
export interface SharedPhysicalRecoveryAssetRequirements {
 readonly references:readonly SharedPhysicalRecoveryAssetReference[];
 readonly uploads:readonly string[];
}
export interface SharedPhysicalRecoveryAssetInfo {
 readonly asset:string;readonly mime:'image/png'|'image/jpeg'|'image/webp';readonly bytes:number;readonly width:number;readonly height:number;
}
export interface SharedPhysicalRecoveryAssetResolution {readonly reference:SharedPhysicalRecoveryAssetReference;readonly contentAsset:string}
export type SharedPhysicalRecoveryAssetMissing=
 |Readonly<{kind:'mapping';reference:SharedPhysicalRecoveryAssetReference}>
 |Readonly<{kind:'bytes';reference:SharedPhysicalRecoveryAssetReference;contentAsset:string}>
 |Readonly<{kind:'uploadBytes';contentAsset:string}>;
/** Detached current native/provider metadata, not a receipt, durable closure or activation grant. */
export interface SharedPhysicalRecoveryAssetRead {
 readonly format:'breditor/physical-room-recovery-asset-read';readonly formatVersion:1;
 readonly selection:SharedPhysicalRecoveryControlSelection;readonly requestSha256:string;
 readonly scope:'server-and-declared-client-binding-and-upload-bytes';
 readonly resolutions:readonly SharedPhysicalRecoveryAssetResolution[];readonly assets:readonly SharedPhysicalRecoveryAssetInfo[];readonly missing:readonly SharedPhysicalRecoveryAssetMissing[];
}
