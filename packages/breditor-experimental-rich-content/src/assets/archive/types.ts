import type {AssetInfo} from "../types.js";
import type {RichAssetOptions} from "../store.js";
export interface RichAssetBackupOptions {signal?:AbortSignal}
/** The supplied source is captured synchronously while the asset snapshot transaction is active.
 * It is caller data, not new native provenance; callbacks must not start asynchronous work. */
export interface RichAssetSourceBackup<T> {readonly source:T;readonly backup:Blob}
/** Restored receipts/statuses are retained host state, never newly authenticated server receipts. */
export interface RichAssetRestoreOptions extends RichAssetOptions,RichAssetBackupOptions {uploadState:"preserve"}
export interface AssetArchiveEntry extends AssetInfo {epoch:number;offset:number}
export interface AssetArchiveHeader {format:"breditor/raster-asset-archive";formatVersion:1;records:AssetArchiveEntry[];sha256:string}
export const MAX_ASSET_BACKUP_HEADER_BYTES=16*1024*1024;
export const ASSET_BACKUP_MIME="application/vnd.breditor.raster-assets";
/** Binary payloads are not expanded into base64 or embedded into document history. */
export const ASSET_BACKUP_MAGIC=new TextEncoder().encode("BREDITOR-ASSETS1\n");
export const ASSET_BACKUP_PREFIX_BYTES=ASSET_BACKUP_MAGIC.length+4;
