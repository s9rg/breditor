import type {AssetLimits,AssetRecord} from "../types.js";
import {readAssetArchiveSnapshot} from "./database.js";
import {assetArchiveEntry} from "./metadata.js";
import {assetArchiveBody,assetArchiveDigest,MAX_ASSET_BACKUP_BYTES,verifyAssetArchiveRaster} from "./codec.js";
import {ASSET_BACKUP_MAGIC,ASSET_BACKUP_MIME,ASSET_BACKUP_PREFIX_BYTES,MAX_ASSET_BACKUP_HEADER_BYTES,type RichAssetBackupOptions} from "./types.js";
import {RichAssetBackupError,checkAssetBackupSignal} from "./error.js";
/** Exact retained bytes and upload state from one read transaction, never a flush or receipt. */
export async function exportAssetBackup(db:IDBDatabase,limits:Readonly<AssetLimits>,options:RichAssetBackupOptions={}):Promise<Blob>{
 const {signal}={...options};checkAssetBackupSignal(signal);const records=await readAssetArchiveSnapshot(db,limits,signal);return encodeAssetArchiveSnapshot(records,limits,signal);
}
/** Admit the complete retained snapshot without constructing an archive for an open operation. */
export async function validateRetainedAssetArchive(db:IDBDatabase,limits:Readonly<AssetLimits>):Promise<void>{
 await validatedArchiveHeader(await readAssetArchiveSnapshot(db,limits),limits);
}

async function validatedArchiveHeader(records:readonly AssetRecord[],limits:Readonly<AssetLimits>,signal?:AbortSignal){
 checkAssetBackupSignal(signal);let offset=0;const entries=records.map(record=>{const entry=assetArchiveEntry(record,offset,limits);offset+=record.bytes;return entry;});
 for(let i=0;i<records.length;i++)await verifyAssetArchiveRaster(entries[i]!,records[i]!.payload,limits,signal);
 const sha256=await assetArchiveDigest(entries),header=new TextEncoder().encode(JSON.stringify({...assetArchiveBody(entries),sha256}));checkAssetBackupSignal(signal);if(header.length>MAX_ASSET_BACKUP_HEADER_BYTES)throw new RichAssetBackupError("asset_backup_budget","Raster archive header exceeds its byte budget");
 if(ASSET_BACKUP_PREFIX_BYTES+header.length+offset>MAX_ASSET_BACKUP_BYTES)throw new RichAssetBackupError("asset_backup_budget","Raster archive exceeds its framed byte budget");
 return header;
}

/** Encode a private previously captured atomic snapshot; no second database read selects new state. */
export async function encodeAssetArchiveSnapshot(records:readonly AssetRecord[],limits:Readonly<AssetLimits>,signal?:AbortSignal):Promise<Blob>{
 const header=await validatedArchiveHeader(records,limits,signal);checkAssetBackupSignal(signal);
 const prefix=new Uint8Array(ASSET_BACKUP_PREFIX_BYTES);prefix.set(ASSET_BACKUP_MAGIC);new DataView(prefix.buffer).setUint32(ASSET_BACKUP_MAGIC.length,header.length);
 return new Blob([prefix,header,...records.map(r=>r.payload)],{type:ASSET_BACKUP_MIME});
}
