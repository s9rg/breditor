import {defaultAssetLimits,type AssetLimits,type AssetRecord} from "../types.js";
import {admitOwnedRaster,admitRaster} from "../admit_raster.js";
import {RichAssetBackupError,checkAssetBackupSignal} from "./error.js";
import {checkAssetArchiveEntry,canonicalAssetArchiveEntry} from "./metadata.js";
import {ASSET_BACKUP_MAGIC,ASSET_BACKUP_PREFIX_BYTES,MAX_ASSET_BACKUP_HEADER_BYTES,type AssetArchiveEntry} from "./types.js";
export const MAX_ASSET_BACKUP_BYTES=ASSET_BACKUP_PREFIX_BYTES+MAX_ASSET_BACKUP_HEADER_BYTES+defaultAssetLimits.maxStoredBytes;
export function assetArchiveBody(records:readonly AssetArchiveEntry[]){return{format:"breditor/raster-asset-archive" as const,formatVersion:1 as const,records};}
export async function assetArchiveDigest(records:readonly AssetArchiveEntry[]):Promise<string>{
 if(!globalThis.crypto?.subtle)throw new RichAssetBackupError("asset_backup_policy","Raster archives require Web Crypto SHA-256");
 const bytes=new TextEncoder().encode(JSON.stringify(assetArchiveBody(records)));if(bytes.length>MAX_ASSET_BACKUP_HEADER_BYTES)throw new RichAssetBackupError("asset_backup_budget","Raster archive metadata exceeds its byte budget");
 const hash=await crypto.subtle.digest("SHA-256",bytes);return[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
/** Reuse the ordinary byte/header/decoder/hash admission, with no network or upload effects. */
export async function verifyAssetArchiveRaster(entry:AssetArchiveEntry,input:Blob|ArrayBuffer,limits:Readonly<AssetLimits>,signal?:AbortSignal):Promise<AssetRecord>{
 checkAssetBackupSignal(signal);let admitted:Awaited<ReturnType<typeof admitRaster>>;
 try{admitted=await (input instanceof Blob?admitRaster(input,limits,signal):admitOwnedRaster(input,entry.mime,limits,signal));}catch{checkAssetBackupSignal(signal);throw new RichAssetBackupError("asset_backup_raster","Raster archive payload failed image admission");}checkAssetBackupSignal(signal);
 if(admitted.asset!==entry.asset||admitted.mime!==entry.mime||admitted.width!==entry.width||admitted.height!==entry.height||admitted.payload.byteLength!==entry.bytes)throw new RichAssetBackupError("asset_backup_integrity","Raster archive bytes differ from their exact manifest");
 const {offset:_offset,...metadata}=entry;return{...metadata,payload:admitted.payload};
}
/** Bounded framing before JSON or image decode; every body byte belongs to one sorted unique asset. */
export async function readAssetArchiveHeader(file:Blob,limits:Readonly<AssetLimits>,signal?:AbortSignal):Promise<{entries:AssetArchiveEntry[];bodyOffset:number}>{
 checkAssetBackupSignal(signal);if(!(file instanceof Blob)||file.size<ASSET_BACKUP_PREFIX_BYTES||file.size>MAX_ASSET_BACKUP_BYTES)throw new RichAssetBackupError("asset_backup_budget","Raster archive exceeds its framed byte budget");
 const prefix=new Uint8Array(await file.slice(0,ASSET_BACKUP_PREFIX_BYTES).arrayBuffer());checkAssetBackupSignal(signal);
 if(ASSET_BACKUP_MAGIC.some((value,index)=>prefix[index]!==value))throw new RichAssetBackupError("asset_backup_format","Unknown raster archive framing");
 const length=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(ASSET_BACKUP_MAGIC.length),bodyOffset=ASSET_BACKUP_PREFIX_BYTES+length;
 if(length<1||length>MAX_ASSET_BACKUP_HEADER_BYTES||bodyOffset>file.size||file.size-bodyOffset>limits.maxStoredBytes)throw new RichAssetBackupError("asset_backup_budget","Raster archive header or payload exceeds its explicit budget");
 const headerBytes=new Uint8Array(await file.slice(ASSET_BACKUP_PREFIX_BYTES,bodyOffset).arrayBuffer());let header:unknown;try{header=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(headerBytes));}catch{throw new RichAssetBackupError("asset_backup_format","Raster archive header is not valid UTF-8 JSON");}checkAssetBackupSignal(signal);
 if(!header||typeof header!=="object"||Array.isArray(header)||Object.keys(header).sort().join(",")!=="format,formatVersion,records,sha256")throw new RichAssetBackupError("asset_backup_format","Expected the closed raster asset archive V1 header");
 const r=header as {format:unknown;formatVersion:unknown;records:unknown;sha256:unknown};if(r.format!=="breditor/raster-asset-archive"||r.formatVersion!==1||!Array.isArray(r.records)||typeof r.sha256!=="string"||!/^[a-f0-9]{64}$/.test(r.sha256))throw new RichAssetBackupError("asset_backup_format","Expected the closed raster asset archive V1 header");
 const entries:AssetArchiveEntry[]=[];let total=0,previous="";for(const value of r.records){checkAssetArchiveEntry(value,limits);if(value.asset<=previous||value.offset!==total)throw new RichAssetBackupError("asset_backup_format","Raster archive assets must be unique and contiguous");previous=value.asset;total+=value.bytes;if(total>limits.maxStoredBytes)throw new RichAssetBackupError("asset_backup_budget","Raster archive payload exceeds the selected store budget");entries.push(canonicalAssetArchiveEntry(value));}
 if(total!==file.size-bodyOffset)throw new RichAssetBackupError("asset_backup_integrity","Raster archive body length differs from its manifest");
 if(await assetArchiveDigest(entries)!==r.sha256)throw new RichAssetBackupError("asset_backup_integrity","Raster archive metadata integrity check failed");const canonical=new TextEncoder().encode(JSON.stringify({...assetArchiveBody(entries),sha256:r.sha256}));if(canonical.length!==headerBytes.length||canonical.some((value,index)=>value!==headerBytes[index]))throw new RichAssetBackupError("asset_backup_format","Raster archive header must retain its canonical V1 bytes");checkAssetBackupSignal(signal);return{entries,bodyOffset};
}
