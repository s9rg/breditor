/** One exact current asset/byte-budget cut, including closed V1 schema admission. */
import type {AssetLimits,AssetRecord} from "../types.js";
import {assetArchiveEntry} from "../archive/metadata.js";
import {RichAssetReconciliationError} from "./error.js";

export function checkAssetReconciliationSchema(db: IDBDatabase, tx: IDBTransaction): void {
  const assets=tx.objectStore("assets"),metadata=tx.objectStore("metadata");
  if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="assets,metadata"||assets.keyPath!=="asset"||assets.autoIncrement||assets.indexNames.length||metadata.keyPath!==null||metadata.autoIncrement||metadata.indexNames.length)throw new RichAssetReconciliationError("asset_reconciliation_policy","The target must retain the original closed asset store schema");
}
export function captureAssetReconciliationSnapshot(db: IDBDatabase,limits:Readonly<AssetLimits>):Promise<AssetRecord[]>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(["assets","metadata"],"readonly");let rows:AssetRecord[]|undefined,budget:unknown,keys:IDBValidKey[]|undefined,failure:unknown;
  tx.onabort=()=>reject(failure??new RichAssetReconciliationError("asset_reconciliation_storage","The target asset snapshot did not complete"));
  tx.oncomplete=()=>{try{if(!rows||!keys||keys.length!==1||keys[0]!=="bytes")throw new RichAssetReconciliationError("asset_reconciliation_format","The target contains missing or foreign asset metadata");let total=0;for(const row of rows){assetArchiveEntry(row,total,limits);total+=row.bytes;}if(total!==budget||total>limits.maxStoredBytes)throw new RichAssetReconciliationError("asset_reconciliation_budget","The target does not retain its exact asset byte budget");resolve(rows);}catch(error){reject(error);}};
  try{checkAssetReconciliationSchema(db,tx);tx.objectStore("assets").getAll().onsuccess=e=>{rows=(e.target as IDBRequest<AssetRecord[]>).result;};tx.objectStore("metadata").get("bytes").onsuccess=e=>{budget=(e.target as IDBRequest).result;};tx.objectStore("metadata").getAllKeys().onsuccess=e=>{keys=(e.target as IDBRequest<IDBValidKey[]>).result;};}catch(error){failure=error;tx.abort();}
 });
}
