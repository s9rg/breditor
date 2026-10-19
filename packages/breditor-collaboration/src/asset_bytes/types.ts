import type {AssetLimits,RichRetainedAssetReference,RasterMime} from "@breditor/experimental-rich-content";
import type {SharedAssetReferenceCapture,SharedAssetCaptureRecord,SharedAssetCapturePending} from "../asset_references_capture.js";
/** A current host check is a callback contract, not a serialized credential or server grant. */
export interface SharedResolvedAssetBytes {
 readonly asset:string;readonly generation:string;
 readonly identity:"content-addressed"|"host-verified";
 readonly blob:Blob;
 /** Synchronous: throw if the original mapping or required provider authority is no longer valid. */
 check():void;
}
export type SharedAssetBytesResolver=(reference:RichRetainedAssetReference,signal:AbortSignal)=>Promise<SharedResolvedAssetBytes|undefined>;
export interface SharedAssetBytesOptions {readonly limits?:Partial<AssetLimits>;readonly signal?:AbortSignal}
export interface SharedAssetBytesCaptureOptions extends SharedAssetBytesOptions {
 readonly source:SharedAssetReferenceCapture;readonly resolveAsset:SharedAssetBytesResolver;
}
export interface SharedAssetByteBinding extends RichRetainedAssetReference {
 readonly identity:"content-addressed"|"host-verified";readonly contentAsset:string;
}
export interface SharedAssetBytePayload {
 readonly contentAsset:string;readonly mime:RasterMime;readonly width:number;readonly height:number;readonly bytes:number;
}
export interface SharedAssetBytesMetadata {
 readonly format:"breditor/shared-selected-asset-bytes";readonly formatVersion:1;
 readonly document:string;readonly revision:string;readonly scope:"native-and-selected-retained-packets";
 readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly SharedAssetBytePayload[];
 readonly sourceBytes:number;readonly assetBytes:number;
}
export type SharedAssetBytesPending=
 |Readonly<{kind:"source";pending:readonly SharedAssetCapturePending[]}>
 |Readonly<{kind:"asset";reference:RichRetainedAssetReference}>;
export interface SharedAssetBytesSnapshot {
 readonly metadata:SharedAssetBytesMetadata;readonly records:readonly SharedAssetCaptureRecord[];
 readonly payloads:ReadonlyMap<string,Blob>;
}
