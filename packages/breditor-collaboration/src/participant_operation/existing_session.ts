import {existingDatabase} from "../participant_recovery/journal.js";
import {SharedEditorError} from "../core.js";
import {fenceOpeningDatabase} from "../persistence/opening_database.js";
/** Operational open cannot initialize, upgrade, overlook an extra key or select another writer. */
export async function existingSessionDatabase(name:string,key:readonly[string,string],code:"session_open_versionchange"|"review_open_versionchange"="session_open_versionchange"):Promise<{db:IDBDatabase;opening:ReturnType<typeof fenceOpeningDatabase>}>{
 const db=await existingDatabase(name);if(!db)throw new SharedEditorError("recovery_origin_missing","The operational session database is absent");
 const opening=fenceOpeningDatabase(db,code);
 try{
  if(db.version!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains("journals"))throw new SharedEditorError("recovery_origin_storage","The operational session schema differs");
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction("journals","readonly"),store=tx.objectStore("journals");let failure:unknown,value:unknown,count:number|undefined,read=false;
   if(store.keyPath!==null||store.autoIncrement||store.indexNames.length){tx.abort();reject(new SharedEditorError("recovery_origin_storage","The operational session schema differs"));return;}
   const check=()=>{if(!read||count===undefined)return;if(count!==1||value===undefined){failure=new SharedEditorError("recovery_origin_missing","The selected operational writer record is absent or ambiguous");tx.abort();}};
   const r=store.get([...key]),c=store.count();r.onsuccess=()=>{value=r.result;read=true;check();};c.onsuccess=()=>{count=c.result;check();};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??new SharedEditorError("recovery_origin_storage","The operational session read failed"));
  });
  opening.assertCurrent();return {db,opening};
 }catch(error){db.close();throw error;}
}
