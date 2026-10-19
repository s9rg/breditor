import {SharedAssetBytesCapture} from "./capture.js";
import {checkAssetBytesSignal,SharedAssetBytesError} from "./guards.js";
import {assetBytesBody,assetBytesDigest,assetBytesUtf8,SHARED_ASSET_BYTES_BACKUP_MAGIC,SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES,SHARED_ASSET_BYTES_BACKUP_MIME,MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES,MAX_SHARED_ASSET_BYTES_BACKUP_BYTES,type AssetBytesSourceEntry,type AssetBytesPayloadEntry} from "./format.js";
import type {SharedAssetBytesOptions} from "./types.js";
const check=SharedAssetBytesCapture.prototype.check,metadata=SharedAssetBytesCapture.prototype.metadata,records=SharedAssetBytesCapture.prototype.records,payload=SharedAssetBytesCapture.prototype.payload;
/** Recheck native/packet/provider continuity around every async digest. No source save or byte upload. */
export async function exportSharedAssetBytesBackup(capture:SharedAssetBytesCapture,options:Pick<SharedAssetBytesOptions,"signal">={}):Promise<Blob>{
 const {signal}={...options},live=()=>{checkAssetBytesSignal(signal);check.call(capture);};live();const view=metadata.call(capture),source=records.call(capture),parts:BlobPart[]=[],recordEntries:AssetBytesSourceEntry[]=[],assetEntries:AssetBytesPayloadEntry[]=[];let offset=0;
 for(const record of source){live();const bytes=assetBytesUtf8(record.json,record.kind==="document"?16*1024*1024:32*1024*1024),sha256=await assetBytesDigest(bytes);live();recordEntries.push({kind:record.kind,bytes:bytes.length,offset,sha256});parts.push(bytes);offset+=bytes.length;}
 if(offset!==view.sourceBytes)throw new SharedAssetBytesError("asset_bytes_integrity","Captured source byte counts differ from their exact records");
 for(const asset of view.assets){live();const blob=payload.call(capture,asset.contentAsset);if(!blob||blob.size!==asset.bytes||blob.type!==asset.mime)throw new SharedAssetBytesError("asset_bytes_integrity","Captured immutable payload differs from its admitted metadata");assetEntries.push({...asset,offset});parts.push(blob);offset+=asset.bytes;}
 const body=assetBytesBody(view,recordEntries,assetEntries),sha256=await assetBytesDigest(assetBytesUtf8(JSON.stringify(body),MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES));live();const header=assetBytesUtf8(JSON.stringify({...body,sha256}),MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES),prefix=new Uint8Array(SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES);prefix.set(SHARED_ASSET_BYTES_BACKUP_MAGIC);new DataView(prefix.buffer).setUint32(SHARED_ASSET_BYTES_BACKUP_MAGIC.length,header.length);
 const file=new Blob([prefix,header,...parts],{type:SHARED_ASSET_BYTES_BACKUP_MIME});if(file.size>MAX_SHARED_ASSET_BYTES_BACKUP_BYTES)throw new SharedAssetBytesError("asset_bytes_budget","Selected asset backup exceeds its complete framed budget");live();return file;
}
