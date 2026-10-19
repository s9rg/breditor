import {assetInfo,type AssetLimits,type AssetRecord} from "../types.js";
import {RichAssetBackupError} from "./error.js";
import type {AssetArchiveEntry} from "./types.js";
const fields="asset,attempts,bytes,epoch,failure,height,mime,offset,status,storageRef,width";
const integer=(value:unknown,minimum:number,maximum=Number.MAX_SAFE_INTEGER):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=minimum&&value<=maximum;
/** The V1 manifest uses one field order, independent of a parsed object's property order. */
export function canonicalAssetArchiveEntry(entry:AssetArchiveEntry):AssetArchiveEntry {
 const {asset,mime,bytes,width,height,status,attempts,storageRef,failure,epoch,offset}=entry;return{asset,mime,bytes,width,height,status,attempts,storageRef,failure,epoch,offset};
}
/** Closed exact queue metadata. It supplies no upload provider, network permission or credential. */
export function checkAssetArchiveEntry(input:unknown,limits:Readonly<AssetLimits>):asserts input is AssetArchiveEntry {
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!==fields)throw new RichAssetBackupError("asset_backup_format","Expected closed raster archive metadata");
 const r=input as AssetArchiveEntry;
 if(typeof r.asset!=="string"||!/^sha256:[0-9a-f]{64}$/.test(r.asset)||!["image/png","image/jpeg","image/webp"].includes(r.mime)||!integer(r.bytes,1,limits.maxFileBytes)||!integer(r.width,1,limits.maxDimension)||!integer(r.height,1,limits.maxDimension)||r.width*r.height>limits.maxPixels||!integer(r.attempts,0)||!integer(r.epoch,0)||!integer(r.offset,0,limits.maxStoredBytes)||!["pending","failed","cancelled","uploaded"].includes(r.status)||!(r.storageRef===null||typeof r.storageRef==="string"&&r.storageRef.length>0&&r.storageRef.length<=4096)||r.status==="uploaded"&&r.storageRef===null||(r.status==="failed"?r.failure!=="upload_failed":r.failure!==null))throw new RichAssetBackupError("asset_backup_format","Raster archive metadata violates its declared store policy");
 // Opaque receipts retain the original JS-string contract, including escaped lone code units.
 // JSON framing is UTF-8 checked separately; never encode/replace a receipt in isolation.
}
export function assetArchiveEntry(record:AssetRecord,offset:number,limits:Readonly<AssetLimits>):AssetArchiveEntry {
 if(!record||typeof record!=="object"||Array.isArray(record)||Object.keys(record).sort().join(",")!=="asset,attempts,bytes,epoch,failure,height,mime,payload,status,storageRef,width"||!(record.payload instanceof ArrayBuffer)||record.payload.byteLength!==record.bytes)throw new RichAssetBackupError("asset_backup_format","Expected an intact raster asset record");
 const entry={...assetInfo(record),epoch:record.epoch,offset};checkAssetArchiveEntry(entry,limits);return entry;
}
