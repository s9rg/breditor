import type {AssetLimits,AssetRecord} from "../types.js";
import {readAssetArchiveHeader,verifyAssetArchiveRaster} from "./codec.js";
import {checkAssetBackupSignal} from "./error.js";
/** Pure admission before destination creation. Source receipt strings are retained, not authenticated. */
export async function importAssetBackup(file:Blob,limits:Readonly<AssetLimits>,signal?:AbortSignal):Promise<AssetRecord[]>{
 const {entries,bodyOffset}=await readAssetArchiveHeader(file,limits,signal),records:AssetRecord[]=[];
 for(const entry of entries){checkAssetBackupSignal(signal);const {record}=await verifyAssetArchiveRaster(entry,file.slice(bodyOffset+entry.offset,bodyOffset+entry.offset+entry.bytes,entry.mime),limits,signal);records.push(record);}
 checkAssetBackupSignal(signal);return records;
}
