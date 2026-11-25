/** Pure closed archive reader. Bytes and upload epochs are retained, never authenticated or retried. */
import {checkedAssetLimits} from "../limits.js";
import type {AssetLimits,AssetInfo} from "../types.js";
import {assetInfo} from "../types.js";
import {readAssetArchiveHeader,verifyAssetArchiveRaster} from "./codec.js";
import {ASSET_BACKUP_MIME} from "./types.js";
import {checkAssetBackupSignal,RichAssetBackupError} from "./error.js";
export interface RichAssetArchiveOptions {readonly limits?:Partial<AssetLimits>;readonly signal?:AbortSignal}
export interface RichAssetArchiveEntry extends Readonly<AssetInfo> {readonly epoch:number}
const key=Object.freeze({}),states=new WeakMap<RichAssetArchive,{file:Blob;payloads:ReadonlyMap<string,Blob>}>();
export class RichAssetArchive {
 readonly #entries:readonly RichAssetArchiveEntry[];
 private constructor(token:object,file:Blob,entries:RichAssetArchiveEntry[],payloads:ReadonlyMap<string,Blob>){
  if(token!==key)throw Error("Invalid asset archive");
  this.#entries=Object.freeze(entries);
  states.set(this,{file,payloads});
  Object.freeze(this);
 }
 /** Detached original status, receipt and epoch data, not a current provider grant. */
 entries():readonly RichAssetArchiveEntry[]{return this.#entries;}
 blob(asset:string):Blob|undefined{const state=states.get(this);if(!state)throw new RichAssetBackupError("asset_backup_closed","The raster archive is disposed or foreign");return state.payloads.get(asset);}
 /** Exact admitted original file for the existing empty-destination restore factory. */
 backup():Blob{const state=states.get(this);if(!state)throw new RichAssetBackupError("asset_backup_closed","The raster archive is disposed or foreign");return state.file;}
 dispose():void{states.delete(this);}
 static async read(input:Blob,options:RichAssetArchiveOptions={}):Promise<RichAssetArchive>{
  const {signal,limits:supplied}={...options},limits=checkedAssetLimits(supplied);checkAssetBackupSignal(signal);
  if(!(input instanceof Blob))throw new RichAssetBackupError("asset_backup_format","Expected a raster archive Blob");
  const file=new Blob([input],{type:ASSET_BACKUP_MIME});
  const {entries,bodyOffset}=await readAssetArchiveHeader(file,limits,signal);
  const metadata:RichAssetArchiveEntry[]=[],payloads=new Map<string,Blob>();
  for(const entry of entries){
   checkAssetBackupSignal(signal);
   const start=bodyOffset+entry.offset;
   const {record,blob}=await verifyAssetArchiveRaster(entry,file.slice(start,start+entry.bytes,entry.mime),limits,signal);
   metadata.push(Object.freeze({...assetInfo(record),epoch:record.epoch}));
   // The decode Blob owns the exact verified bytes, even when the source file later changes.
   payloads.set(record.asset,blob);
  }
  checkAssetBackupSignal(signal);
  return new RichAssetArchive(key,file,metadata,payloads);
 }
}
export const readRichAssetBackup=(file:Blob,options:RichAssetArchiveOptions={}):Promise<RichAssetArchive>=>RichAssetArchive.read(file,options);
