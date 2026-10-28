/** New read-only requirement scope. Bindings and unreferenced uploads have different identities. */
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
export const MAX_SERVER_GENERATION_RECOVERY_ASSET_BYTES=32*1024*1024;
export const MAX_SERVER_GENERATION_RECOVERY_ASSET_REQUIREMENTS=100000;
export interface SharedServerLogGenerationRecoveryAssetReference {readonly asset:string;readonly generation:string}
export interface SharedServerLogGenerationRecoveryAssetRequirements {
 readonly references:readonly SharedServerLogGenerationRecoveryAssetReference[];
 readonly uploads:readonly string[];
}
export interface SharedServerLogGenerationRecoveryAssetInfo {
 readonly asset:string;readonly mime:'image/png'|'image/jpeg'|'image/webp';readonly bytes:number;readonly width:number;readonly height:number;
}
export interface SharedServerLogGenerationRecoveryAssetResolution {readonly reference:SharedServerLogGenerationRecoveryAssetReference;readonly contentAsset:string}
export type SharedServerLogGenerationRecoveryAssetMissing=
 |Readonly<{kind:'mapping';reference:SharedServerLogGenerationRecoveryAssetReference}>
 |Readonly<{kind:'bytes';reference:SharedServerLogGenerationRecoveryAssetReference;contentAsset:string}>
 |Readonly<{kind:'uploadBytes';contentAsset:string}>;
/** Detached current native/provider metadata, not a receipt, durable closure or activation grant. */
export interface SharedServerLogGenerationRecoveryAssetRead {
 readonly format:'breditor/server-log-generation-recovery-asset-read';readonly formatVersion:1;
 readonly selection:SharedServerLogGenerationRecoveryControlSelection;readonly requestSha256:string;
 readonly scope:'server-and-declared-client-binding-and-upload-bytes';
 readonly resolutions:readonly SharedServerLogGenerationRecoveryAssetResolution[];readonly assets:readonly SharedServerLogGenerationRecoveryAssetInfo[];readonly missing:readonly SharedServerLogGenerationRecoveryAssetMissing[];
}
