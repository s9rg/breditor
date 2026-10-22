/** Complete two-lane delivery source, selected raster bytes and whole upload state. */
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryIdentity} from '../independent_delivery/contract.js';
import type {SharedIndependentDeliverySourceSelection} from '../independent_delivery_source/contract.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetByteBinding,SharedAssetBytePayload} from '../asset_bytes/types.js';
export interface SharedIndependentDeliveryParticipantIdentity{readonly participant:string;readonly principal:string;readonly source:SharedIndependentDeliveryIdentity;readonly assets:'whole-store'}
export interface SharedIndependentDeliveryParticipantSelection{readonly identity:SharedIndependentDeliveryParticipantIdentity;readonly sha256:string}
export interface SharedIndependentDeliveryParticipantCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedAssetBytesOptions{
 readonly participant:string;readonly principal:string;readonly source:SharedIndependentDeliverySourceSelection<P>;
 readonly assets:RichAssetStore;readonly checkAuthority:()=>void;readonly resolveAsset?:SharedAssetBytesResolver;
}
export interface SharedIndependentDeliveryParticipantMetadata{
 readonly format:'breditor/shared-independent-delivery-participant-bytes';readonly formatVersion:1;
 readonly identity:SharedIndependentDeliveryParticipantIdentity;readonly document:string;readonly revision:string;
 readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly SharedAssetBytePayload[];
 readonly sourceBytes:number;readonly assetBytes:number;
}
