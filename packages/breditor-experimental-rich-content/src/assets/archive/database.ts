import type {AssetLimits,AssetRecord} from "../types.js";
import {assetArchiveEntry} from "./metadata.js";
import {MAX_ASSET_BACKUP_HEADER_BYTES} from "./types.js";
import {RichAssetBackupError,checkAssetBackupSignal} from "./error.js";
const exactStores=(db:IDBDatabase)=>db.version===1&&[...db.objectStoreNames].sort().join(",")==="assets,metadata";
const exactLayout=(assets:IDBObjectStore,metadata:IDBObjectStore)=>
 assets.keyPath==="asset"&&!assets.autoIncrement&&!assets.indexNames.length&&metadata.keyPath===null&&!metadata.autoIncrement&&!metadata.indexNames.length;
const exactBudgetKey=(keys:IDBValidKey[])=>keys.length===1&&keys[0]==="bytes";
/** One read transaction captures retained bytes and all queue epochs, including history-only images. */
export function readAssetArchiveSnapshot(db:IDBDatabase,limits:Readonly<AssetLimits>,signal?:AbortSignal):Promise<AssetRecord[]> {
 return captureAssetArchiveSnapshot(db,limits,()=>undefined,signal).then(value=>value.records);
}
/** Run-to-completion source capture inside the validated asset read snapshot, not after commit.
 * No writer on these IDB stores can commit between the asset cut and this synchronous callback. */
export function captureAssetArchiveSnapshot<T>(db:IDBDatabase,limits:Readonly<AssetLimits>,capture:()=>T,signal?:AbortSignal):Promise<{records:AssetRecord[];source:T}> {
 checkAssetBackupSignal(signal);
 if(!exactStores(db))throw new RichAssetBackupError("asset_backup_storage","Snapshot requires the exact asset storage family");
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(["assets","metadata"],"readonly"),assets=tx.objectStore("assets"),metadata=tx.objectStore("metadata"),records:AssetRecord[]=[];let bytes=0,headerBytes=256,budget:unknown,failure:unknown,keys:IDBValidKey[]|undefined,readBudget=false,ended=false,captured=false,source:T;
  const ready=()=>{if(!readBudget||!keys||!ended||captured)return;try{
   checkAssetBackupSignal(signal);if(!exactBudgetKey(keys)||budget!==bytes)throw new RichAssetBackupError("asset_backup_storage","Retained asset metadata does not match its atomic budget");
   try{source=capture();if(source&&(typeof source==="object"||typeof source==="function")&&typeof(source as {then?:unknown}).then==="function"){
    void Promise.resolve(source).catch(()=>{});throw Error();
   }}catch{throw new RichAssetBackupError("asset_backup_source","Asset backup source capture must complete synchronously");}
   checkAssetBackupSignal(signal);captured=true;
  }catch(error){failure=error;try{tx.abort();}catch{/* Cancellation may already have aborted this transaction. */}}};
  const abort=()=>{failure=new RichAssetBackupError("asset_backup_aborted","Asset archive work was cancelled");try{tx.abort();}catch{}};signal?.addEventListener("abort",abort,{once:true});
  tx.oncomplete=()=>{signal?.removeEventListener("abort",abort);if(!captured){reject(new RichAssetBackupError("asset_backup_storage","Asset snapshot source was not captured"));return;}resolve({records,source});};tx.onabort=()=>{signal?.removeEventListener("abort",abort);reject(failure??new RichAssetBackupError("asset_backup_storage","Asset archive snapshot did not complete"));};
  if(!exactLayout(assets,metadata)){failure=new RichAssetBackupError("asset_backup_storage","Snapshot storage layout differs");tx.abort();return;}
  const budgetRequest=metadata.get("bytes");budgetRequest.onsuccess=()=>{budget=budgetRequest.result;readBudget=true;ready();};
  const keyRequest=metadata.getAllKeys(undefined,2);keyRequest.onsuccess=()=>{keys=keyRequest.result;ready();};
  const request=assets.openCursor();request.onsuccess=()=>{try{checkAssetBackupSignal(signal);const cursor=request.result;if(!cursor){ended=true;ready();return;}const record=cursor.value as AssetRecord,entry=assetArchiveEntry(record,bytes,limits);headerBytes+=new TextEncoder().encode(JSON.stringify(entry)).length+1;bytes+=record.bytes;if(bytes>limits.maxStoredBytes||headerBytes>MAX_ASSET_BACKUP_HEADER_BYTES)throw new RichAssetBackupError("asset_backup_budget","Retained assets exceed the explicit archive budget");records.push(record);cursor.continue();}catch(error){failure=error;try{tx.abort();}catch{/* An earlier abort still owns the terminal event. */}}};
 });
}
/** Empty-store compare and every add/byte counter share one transaction; no existing asset is replaced. */
export function insertAssetArchive(db:IDBDatabase,records:readonly AssetRecord[],signal?:AbortSignal):Promise<void>{
 checkAssetBackupSignal(signal);
 if(!exactStores(db))throw new RichAssetBackupError("asset_backup_storage","Restore requires the exact asset storage family");
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(["assets","metadata"],"readwrite"),assets=tx.objectStore("assets"),metadata=tx.objectStore("metadata");let count:number|undefined,budget:unknown,keys:IDBValidKey[]|undefined,readBudget=false,failure:unknown;
  const abort=()=>{failure=new RichAssetBackupError("asset_backup_aborted","Asset archive work was cancelled");try{tx.abort();}catch{}};signal?.addEventListener("abort",abort,{once:true});tx.oncomplete=()=>{signal?.removeEventListener("abort",abort);resolve();};tx.onabort=()=>{signal?.removeEventListener("abort",abort);reject(failure??new RichAssetBackupError("asset_backup_storage","Asset archive insertion did not commit"));};
  if(!exactLayout(assets,metadata)){
   failure=new RichAssetBackupError("asset_backup_storage","Restore storage layout differs");tx.abort();return;
  }
  const ready=()=>{if(count===undefined||!readBudget||!keys)return;try{checkAssetBackupSignal(signal);if(count!==0||budget!==0||!exactBudgetKey(keys))throw new RichAssetBackupError("asset_backup_destination_exists","Asset archive destination is not exactly empty");for(const record of records)assets.add(record);metadata.put(records.reduce((sum,r)=>sum+r.bytes,0),"bytes");}catch(error){failure=error;tx.abort();}};
  const countRequest=assets.count();countRequest.onsuccess=()=>{count=countRequest.result;ready();};const budgetRequest=metadata.get("bytes");budgetRequest.onsuccess=()=>{budget=budgetRequest.result;readBudget=true;ready();};
  const keyRequest=metadata.getAllKeys(undefined,2);keyRequest.onsuccess=()=>{keys=keyRequest.result;ready();};
 });
}
