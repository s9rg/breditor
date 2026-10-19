import {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import type {SharedAssetBytesSnapshot} from "./types.js";
export class SharedAssetBytesError extends Error {
 constructor(readonly code:"asset_bytes_source"|"asset_bytes_provider"|"asset_bytes_budget"|"asset_bytes_integrity"|"asset_bytes_raster"|"asset_bytes_aborted"|"asset_bytes_format"|"asset_bytes_closed",message:string){super(message);this.name="SharedAssetBytesError";}
}
export const assetBytesKey=(asset:string,generation:string):string=>{if(typeof asset!=="string"||typeof generation!=="string")throw new SharedAssetBytesError("asset_bytes_format","Asset byte lookups require exact string identities");return JSON.stringify([asset,generation]);};
export function checkAssetBytesSignal(signal?:AbortSignal):void{if(signal?.aborted)throw new SharedAssetBytesError("asset_bytes_aborted","Asset byte work was cancelled");}
const check=SharedAssetReferenceCapture.prototype.check,metadata=SharedAssetReferenceCapture.prototype.metadata,records=SharedAssetReferenceCapture.prototype.records;
/** Canonical methods enforce the actual SDK handle, even if an input object imitates its methods. */
export function assetBytesSource(source:SharedAssetReferenceCapture){
 const live=()=>{try{check.call(source);}catch{throw new SharedAssetBytesError("asset_bytes_source","The exact selected native/packet source is no longer current");}};live();
 return {check:live,metadata:metadata.call(source),records:records.call(source)};
}
export function synchronousProviderCheck(run:()=>unknown):()=>void {
 return()=>{let result:unknown;try{result=run();}catch{throw new SharedAssetBytesError("asset_bytes_provider","The host asset mapping or provider guard no longer holds");}
  if(result!==undefined){if(result!==null&&(typeof result==="object"||typeof result==="function")){try{if(typeof (result as {then?:unknown}).then==="function")void Promise.resolve(result).catch(()=>{});}catch{/* A malformed host guard still refuses the capture. */}}throw new SharedAssetBytesError("asset_bytes_provider","Provider checks must complete synchronously without a result");}
 };
}
export function checkAssetBytesSnapshotSource(snapshot:SharedAssetBytesSnapshot,source:SharedAssetReferenceCapture):void{
 const current=assetBytesSource(source),m=current.metadata;
 if(m.document!==snapshot.metadata.document||m.revision!==snapshot.metadata.revision||m.scope!==snapshot.metadata.scope||m.outcome.kind!=="ready"||JSON.stringify(m.outcome.references)!==JSON.stringify(snapshot.metadata.bindings.map(({asset,generation})=>({asset,generation})))||JSON.stringify(current.records)!==JSON.stringify(snapshot.records))throw new SharedAssetBytesError("asset_bytes_source","Archive records and complete references differ from the selected native source");current.check();
}
