/** Pure ordinary raster admission for backup bytes; no database, provider or document mutation. */
import {admitRaster} from "./admit_raster.js";
import {checkedAssetLimits} from "./limits.js";
import {RichAssetBackupError,checkAssetBackupSignal} from "./archive/error.js";
import type {AssetLimits,RasterMime} from "./types.js";
export interface RichRasterInspectionOptions {readonly limits?:Partial<AssetLimits>;readonly signal?:AbortSignal}
export interface RichRasterInspection {
 readonly asset:string;readonly mime:RasterMime;readonly width:number;readonly height:number;
 readonly bytes:number;readonly blob:Blob;
}
/** Snapshot Blob bytes before asynchronous decoding. Returned metadata and payload are immutable. */
export async function inspectRichRaster(input:Blob,options:RichRasterInspectionOptions={}):Promise<RichRasterInspection>{
 const {signal,limits:supplied}={...options},limits=checkedAssetLimits(supplied);checkAssetBackupSignal(signal);
 if(!(input instanceof Blob))throw new RichAssetBackupError("asset_backup_raster","Expected immutable raster bytes");
 const snapshot=new Blob([input],{type:input.type});let admitted:Awaited<ReturnType<typeof admitRaster>>;
 try{admitted=await admitRaster(snapshot,limits);}catch{checkAssetBackupSignal(signal);throw new RichAssetBackupError("asset_backup_raster","Raster bytes failed ordinary image admission");}
 checkAssetBackupSignal(signal);return Object.freeze({asset:admitted.asset,mime:admitted.mime,width:admitted.width,height:admitted.height,bytes:admitted.payload.byteLength,blob:Object.freeze(new Blob([admitted.payload],{type:admitted.mime}))});
}
