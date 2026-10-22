/** Guard new empty schema creation in its actual upgrade callback. Existing data is never reset. */
import {RichAssetBackupError} from './error.js';
export function openHeldAssetDestination(name:string,check:()=>void):Promise<IDBDatabase>{
 if(typeof name!=='string'||!name.trim()||name.length>200)throw new RichAssetBackupError('asset_backup_policy','Select a 1–200 character destination');check();
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(name,1);let blocked=false,reason:unknown;
  request.onupgradeneeded=event=>{try{check();if(event.oldVersion!==0)throw new RichAssetBackupError('asset_backup_storage','Held restore never upgrades existing storage');request.result.createObjectStore('assets',{keyPath:'asset'});check();const metadata=request.result.createObjectStore('metadata');check();metadata.put(0,'bytes');check();}catch(error){reason=error;request.transaction!.abort();}};
  request.onerror=()=>reject(reason??new RichAssetBackupError('asset_backup_storage','Held restore storage did not open'));
  request.onblocked=()=>{blocked=true;reject(new RichAssetBackupError('asset_backup_storage','Held restore storage is blocked'));};
  request.onsuccess=()=>{try{check();const db=request.result;if(blocked||db.version!==1||[...db.objectStoreNames].sort().join(',')!=='assets,metadata')throw new RichAssetBackupError('asset_backup_storage','Held restore storage family differs');resolve(db);}catch(error){request.result.close();reject(error);}};
 });
}
