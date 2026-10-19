import type {AssetLimits} from "../types.js";
import {readAssetArchiveSnapshot} from "./database.js";
import {assetArchiveEntry} from "./metadata.js";
import {assetArchiveBody,assetArchiveDigest,MAX_ASSET_BACKUP_BYTES,verifyAssetArchiveRaster} from "./codec.js";
import {ASSET_BACKUP_MAGIC,ASSET_BACKUP_MIME,ASSET_BACKUP_PREFIX_BYTES,MAX_ASSET_BACKUP_HEADER_BYTES,type RichAssetBackupOptions} from "./types.js";
import {RichAssetBackupError,checkAssetBackupSignal} from "./error.js";
/** Exact retained bytes and upload state from one read transaction, never a flush or receipt. */
export async function exportAssetBackup(db:IDBDatabase,limits:Readonly<AssetLimits>,options:RichAssetBackupOptions={}):Promise<Blob>{
 const {signal}={...options};checkAssetBackupSignal(signal);const records=await readAssetArchiveSnapshot(db,limits,signal);let offset=0;const entries=records.map(record=>{const entry=assetArchiveEntry(record,offset,limits);offset+=record.bytes;return entry;});
 for(let i=0;i<records.length;i++)await verifyAssetArchiveRaster(entries[i]!,new Blob([records[i]!.payload],{type:records[i]!.mime}),limits,signal);
 const sha256=await assetArchiveDigest(entries),header=new TextEncoder().encode(JSON.stringify({...assetArchiveBody(entries),sha256}));checkAssetBackupSignal(signal);if(header.length>MAX_ASSET_BACKUP_HEADER_BYTES)throw new RichAssetBackupError("asset_backup_budget","Raster archive header exceeds its byte budget");
 const prefix=new Uint8Array(ASSET_BACKUP_PREFIX_BYTES);prefix.set(ASSET_BACKUP_MAGIC);new DataView(prefix.buffer).setUint32(ASSET_BACKUP_MAGIC.length,header.length);
 const backup=new Blob([prefix,header,...records.map(r=>r.payload)],{type:ASSET_BACKUP_MIME});if(backup.size>MAX_ASSET_BACKUP_BYTES)throw new RichAssetBackupError("asset_backup_budget","Raster archive exceeds its framed byte budget");return backup;
}
