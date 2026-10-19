import type {AssetLimits,AssetRecord} from "../types.js";
import {assetArchiveEntry} from "./metadata.js";
import {MAX_ASSET_BACKUP_HEADER_BYTES} from "./types.js";
import {RichAssetBackupError,checkAssetBackupSignal} from "./error.js";
/** One read transaction captures retained bytes and all queue epochs, including history-only images. */
export function readAssetArchiveSnapshot(db:IDBDatabase,limits:Readonly<AssetLimits>,signal?:AbortSignal):Promise<AssetRecord[]> {
 checkAssetBackupSignal(signal);
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(["assets","metadata"],"readonly"),records:AssetRecord[]=[];let bytes=0,headerBytes=256,budget:unknown,failure:unknown;
  const abort=()=>{failure=new RichAssetBackupError("asset_backup_aborted","Asset archive work was cancelled");try{tx.abort();}catch{}};signal?.addEventListener("abort",abort,{once:true});
  tx.oncomplete=()=>{signal?.removeEventListener("abort",abort);if(budget!==bytes){reject(new RichAssetBackupError("asset_backup_storage","Retained asset bytes do not match their atomic budget"));return;}resolve(records);};tx.onabort=()=>{signal?.removeEventListener("abort",abort);reject(failure??new RichAssetBackupError("asset_backup_storage","Asset archive snapshot did not complete"));};
  tx.objectStore("metadata").get("bytes").onsuccess=event=>{budget=(event.target as IDBRequest).result;};
  const request=tx.objectStore("assets").openCursor();request.onsuccess=()=>{try{checkAssetBackupSignal(signal);const cursor=request.result;if(!cursor)return;const record=cursor.value as AssetRecord,entry=assetArchiveEntry(record,bytes,limits);headerBytes+=new TextEncoder().encode(JSON.stringify(entry)).length+1;bytes+=record.bytes;if(bytes>limits.maxStoredBytes||headerBytes>MAX_ASSET_BACKUP_HEADER_BYTES)throw new RichAssetBackupError("asset_backup_budget","Retained assets exceed the explicit archive budget");records.push(record);cursor.continue();}catch(error){failure=error;tx.abort();}};
 });
}
/** Empty-store compare and every add/byte counter share one transaction; no existing asset is replaced. */
export function insertAssetArchive(db:IDBDatabase,records:readonly AssetRecord[],signal?:AbortSignal):Promise<void>{
 checkAssetBackupSignal(signal);
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(["assets","metadata"],"readwrite"),assets=tx.objectStore("assets"),metadata=tx.objectStore("metadata");let count:number|undefined,budget:unknown,readBudget=false,failure:unknown;
  const abort=()=>{failure=new RichAssetBackupError("asset_backup_aborted","Asset archive work was cancelled");try{tx.abort();}catch{}};signal?.addEventListener("abort",abort,{once:true});tx.oncomplete=()=>{signal?.removeEventListener("abort",abort);resolve();};tx.onabort=()=>{signal?.removeEventListener("abort",abort);reject(failure??new RichAssetBackupError("asset_backup_storage","Asset archive insertion did not commit"));};
  const ready=()=>{if(count===undefined||!readBudget)return;try{checkAssetBackupSignal(signal);if(count!==0||budget!==0)throw new RichAssetBackupError("asset_backup_destination_exists","Asset archive destination is not empty");for(const record of records)assets.add(record);metadata.put(records.reduce((sum,r)=>sum+r.bytes,0),"bytes");}catch(error){failure=error;tx.abort();}};
  const countRequest=assets.count();countRequest.onsuccess=()=>{count=countRequest.result;ready();};const budgetRequest=metadata.get("bytes");budgetRequest.onsuccess=()=>{budget=budgetRequest.result;readBudget=true;ready();};
 });
}
