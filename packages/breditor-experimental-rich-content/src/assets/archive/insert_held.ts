/** Insert exact admitted rows under a genuine caller-held store scope, never merge/overwrite.
 * The host/current-custody callback runs within the actual insertion transaction. */
import type {AssetRecord} from '../types.js';
import {RichAssetBackupError,checkAssetBackupSignal} from './error.js';
export function insertHeldAssetArchive(db:IDBDatabase,records:readonly AssetRecord[],check:()=>void,signal?:AbortSignal):Promise<void>{
 check();checkAssetBackupSignal(signal);
 if(db.version!==1||[...db.objectStoreNames].sort().join(',')!=='assets,metadata')throw new RichAssetBackupError('asset_backup_storage','Held restore requires the exact asset storage family');
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['assets','metadata'],'readwrite',{durability:'strict'});let failure:unknown,count:number|undefined,budget:unknown,keys:IDBValidKey[]|undefined,readBudget=false;
  const abort=(error:unknown)=>{failure??=error;try{tx.abort();}catch{/* The actual transaction still determines whether bytes committed. */}};
  const cancelled=()=>abort(new RichAssetBackupError('asset_backup_aborted','Held asset insertion was cancelled'));
  signal?.addEventListener('abort',cancelled,{once:true});tx.oncomplete=()=>{signal?.removeEventListener('abort',cancelled);resolve();};tx.onabort=()=>{signal?.removeEventListener('abort',cancelled);reject(failure??new RichAssetBackupError('asset_backup_storage','Held asset insertion did not commit'));};
  try{
   const assets=tx.objectStore('assets'),metadata=tx.objectStore('metadata');
   if(assets.keyPath!=='asset'||assets.autoIncrement||assets.indexNames.length||metadata.keyPath!==null||metadata.autoIncrement||metadata.indexNames.length)throw new RichAssetBackupError('asset_backup_storage','Held restore storage layout differs');
   const ready=()=>{if(count===undefined||!readBudget||keys===undefined)return;try{check();checkAssetBackupSignal(signal);if(count!==0||budget!==0||keys.length!==1||keys[0]!=='bytes')throw new RichAssetBackupError('asset_backup_destination_exists','Held restore destination is not exactly empty');for(const record of records){check();assets.add(record);}check();metadata.put(records.reduce((sum,r)=>sum+r.bytes,0),'bytes');check();}catch(error){abort(error);}};
   const c=assets.count(),b=metadata.get('bytes'),k=metadata.getAllKeys(undefined,2);c.onsuccess=()=>{count=c.result;ready();};b.onsuccess=()=>{budget=b.result;readBudget=true;ready();};k.onsuccess=()=>{keys=k.result;ready();};
  }catch(error){abort(error);}
 });
}
