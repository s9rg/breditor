import type {SharedAssetByteBinding,SharedAssetBytePayload,SharedAssetBytesOptions,SharedAssetBytesResolver} from "../asset_bytes/types.js";
import type {SharedGenerationSourceCapture} from "../generation_source/capture.js";
import type {SharedGenerationSourceIdentity,SharedGenerationSourceRecord} from "../generation_source/contract.js";
export interface SharedGenerationAssetCaptureOptions extends SharedAssetBytesOptions{readonly source:SharedGenerationSourceCapture;readonly resolveAsset:SharedAssetBytesResolver}
export interface SharedGenerationAssetMetadata {
 readonly format:"breditor/shared-generation-asset-bytes";readonly formatVersion:1;
 readonly identity:SharedGenerationSourceIdentity;readonly document:string;readonly revision:string;
 readonly bindings:readonly SharedAssetByteBinding[];readonly assets:readonly SharedAssetBytePayload[];
 readonly sourceBytes:number;readonly assetBytes:number;
}
export interface GenerationAssetSnapshot {metadata:SharedGenerationAssetMetadata;records:readonly SharedGenerationSourceRecord[];payloads:ReadonlyMap<string,Blob>}
