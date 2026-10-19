/** Independent selected-source byte framing, never an original native journal or asset-store format. */
import {defaultAssetLimits} from "@breditor/experimental-rich-content";
import {MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES,type SharedAssetCaptureSourceKind} from "../asset_references_capture.js";
import {SharedAssetBytesError} from "./guards.js";
import type {SharedAssetBytesMetadata,SharedAssetBytePayload} from "./types.js";
export const SHARED_ASSET_BYTES_BACKUP_MIME="application/vnd.breditor.selected-asset-bytes";
export const SHARED_ASSET_BYTES_BACKUP_MAGIC=new TextEncoder().encode("BREDITOR-SELECTED1\n");
export const SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES=SHARED_ASSET_BYTES_BACKUP_MAGIC.length+4;
export const MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES=64*1024*1024;
export const MAX_SHARED_ASSET_BYTES_BACKUP_BYTES=SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES+MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES+MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES+defaultAssetLimits.maxStoredBytes;
export interface AssetBytesSourceEntry {kind:SharedAssetCaptureSourceKind;bytes:number;offset:number;sha256:string}
export interface AssetBytesPayloadEntry extends SharedAssetBytePayload {offset:number}
export interface AssetBytesHeader {
 format:"breditor/shared-selected-asset-backup";formatVersion:1;
 metadata:SharedAssetBytesMetadata;records:AssetBytesSourceEntry[];assets:AssetBytesPayloadEntry[];sha256:string;
}
export function assetBytesBody(metadata:SharedAssetBytesMetadata,records:readonly AssetBytesSourceEntry[],assets:readonly AssetBytesPayloadEntry[]){return{format:"breditor/shared-selected-asset-backup" as const,formatVersion:1 as const,metadata,records,assets};}
export async function assetBytesDigest(bytes:Uint8Array<ArrayBuffer>):Promise<string>{
 if(!globalThis.crypto?.subtle)throw new SharedAssetBytesError("asset_bytes_integrity","Asset byte backups require Web Crypto SHA-256");
 const result=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(result)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
export function assetBytesUtf8(value:string,max:number):Uint8Array<ArrayBuffer>{
 if(typeof value!=="string"||value.length>max)throw new SharedAssetBytesError("asset_bytes_budget","Asset source text exceeds its explicit byte budget");const bytes=new TextEncoder().encode(value);
 if(bytes.byteLength>max)throw new SharedAssetBytesError("asset_bytes_budget","Asset source text exceeds its explicit byte budget");if(new TextDecoder("utf-8",{fatal:true}).decode(bytes)!==value)throw new SharedAssetBytesError("asset_bytes_format","Asset source text must preserve well-formed Unicode");return bytes;
}
