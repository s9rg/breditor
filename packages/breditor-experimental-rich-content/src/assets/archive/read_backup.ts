/** Pure closed archive reader. Bytes and upload epochs are retained, never authenticated or retried. */
import {checkedAssetLimits} from "../limits.js";
import type {AssetLimits,AssetInfo,AssetRecord} from "../types.js";
import {assetInfo} from "../types.js";
import {importAssetBackup} from "./import_backup.js";
import {ASSET_BACKUP_MIME} from "./types.js";
import {checkAssetBackupSignal,RichAssetBackupError} from "./error.js";
export interface RichAssetArchiveOptions {readonly limits?:Partial<AssetLimits>;readonly signal?:AbortSignal}
export interface RichAssetArchiveEntry extends Readonly<AssetInfo> {readonly epoch:number}
const key=Object.freeze({}),states=new WeakMap<RichAssetArchive,{file:Blob;payloads:ReadonlyMap<string,Blob>}>();
export class RichAssetArchive {
 readonly #entries:readonly RichAssetArchiveEntry[];
 private constructor(token:object,file:Blob,records:readonly AssetRecord[]){if(token!==key)throw Error("Invalid asset archive");this.#entries=Object.freeze(records.map(record=>Object.freeze({...assetInfo(record),epoch:record.epoch})));states.set(this,{file,payloads:new Map(records.map(record=>[record.asset,new Blob([record.payload],{type:record.mime})]))});Object.freeze(this);}
 /** Detached original status, receipt and epoch data, not a current provider grant. */
 entries():readonly RichAssetArchiveEntry[]{return this.#entries;}
 blob(asset:string):Blob|undefined{const state=states.get(this);if(!state)throw new RichAssetBackupError("asset_backup_closed","The raster archive is disposed or foreign");return state.payloads.get(asset);}
 /** Exact admitted original file for the existing empty-destination restore factory. */
 backup():Blob{const state=states.get(this);if(!state)throw new RichAssetBackupError("asset_backup_closed","The raster archive is disposed or foreign");return state.file;}
 dispose():void{states.delete(this);}
 static async read(input:Blob,options:RichAssetArchiveOptions={}):Promise<RichAssetArchive>{
  const {signal,limits:supplied}={...options},limits=checkedAssetLimits(supplied);checkAssetBackupSignal(signal);
  if(!(input instanceof Blob))throw new RichAssetBackupError("asset_backup_format","Expected a raster archive Blob");
  const file=new Blob([input],{type:ASSET_BACKUP_MIME}),records=await importAssetBackup(file,limits,signal);checkAssetBackupSignal(signal);return new RichAssetArchive(key,file,records);
 }
}
export const readRichAssetBackup=(file:Blob,options:RichAssetArchiveOptions={}):Promise<RichAssetArchive>=>RichAssetArchive.read(file,options);
