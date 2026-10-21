/** Explicit local paired histories plus complete upload state. No relay or activation claim. */
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {IndependentHistoryIdentity} from '../independent_history/contract.js';
import type {SharedIndependentSourceSelection} from '../independent_source/contract.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetByteBinding,SharedAssetBytePayload} from '../asset_bytes/types.js';
export interface SharedIndependentParticipantIdentity {readonly participant:string;readonly principal:string;readonly source:IndependentHistoryIdentity;readonly assets:'whole-store'}
export interface SharedIndependentParticipantSelection {readonly identity:SharedIndependentParticipantIdentity;readonly sha256:string}
export interface SharedIndependentParticipantCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedAssetBytesOptions {
 readonly participant:string;readonly principal:string;readonly source:SharedIndependentSourceSelection<P>;
 readonly assets:RichAssetStore;readonly checkAuthority:()=>void;readonly resolveAsset?:SharedAssetBytesResolver;
}
export interface SharedIndependentParticipantMetadata {
 readonly format:'breditor/shared-independent-participant-bytes';readonly formatVersion:1;
 readonly identity:SharedIndependentParticipantIdentity;readonly document:string;readonly revision:string;
 readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly SharedAssetBytePayload[];
 readonly sourceBytes:number;readonly assetBytes:number;
}
