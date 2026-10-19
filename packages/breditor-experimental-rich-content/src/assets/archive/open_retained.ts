import {RichAssetBackupError} from "./error.js";
/** Never initializes a missing raster database or upgrades a different family. */
export async function openRetainedAssetDatabase(name:string):Promise<{db:IDBDatabase;assertCurrent:()=>void}>{
 if(!name||name.length>200)throw new RichAssetBackupError("asset_backup_policy","Expected an explicit retained database name");
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name);let missing=false,blocked=false;r.onupgradeneeded=()=>{missing=true;r.transaction!.abort();};r.onerror=()=>reject(new RichAssetBackupError("asset_backup_storage",missing?"The retained asset database is missing":"The retained asset database is unavailable"));r.onblocked=()=>{blocked=true;reject(new RichAssetBackupError("asset_backup_storage","Retained asset storage is blocked"));};r.onsuccess=()=>{if(blocked)r.result.close();else resolve(r.result);};});
 let changed=false;const assertCurrent=()=>{if(changed)throw new RichAssetBackupError("asset_backup_storage","Retained asset storage changed while opening");};db.onversionchange=()=>{changed=true;db.close();};
 try{
  if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="assets,metadata")throw new RichAssetBackupError("asset_backup_storage","The retained asset schema differs");
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction(["assets","metadata"],"readonly"),assets=tx.objectStore("assets"),metadata=tx.objectStore("metadata");let reason:unknown;
   const fail=()=>{reason=new RichAssetBackupError("asset_backup_storage","The retained asset schema differs");try{tx.abort();}catch{}};
   if(assets.keyPath!=="asset"||assets.autoIncrement||assets.indexNames.length||metadata.keyPath!==null||metadata.autoIncrement||metadata.indexNames.length)fail();else{const count=metadata.count();count.onsuccess=()=>{if(count.result!==1)fail();};}
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason??new RichAssetBackupError("asset_backup_storage","The retained asset inspection failed"));
  });assertCurrent();return{db,assertCurrent};
 }catch(error){db.close();throw error;}
}
