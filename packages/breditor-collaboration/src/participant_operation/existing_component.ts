import {existingDatabase} from "../participant_recovery/journal.js";
import {operationFailure} from "./errors.js";
/** Existing one-key retained stores only; fence before reads and return that same live fence. */
export async function existingOperationalComponent(name:string,store:string,key:IDBValidKey):Promise<{db:IDBDatabase;record:unknown;assertCurrent:()=>void}>{
 const db=await existingDatabase(name);if(!db)throw operationFailure("operation_missing");let changed=false;
 const assertCurrent=()=>{if(changed)throw operationFailure("operation_versionchange");};db.onversionchange=()=>{changed=true;db.close();};
 try{
  if(db.version!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains(store))throw operationFailure("operation_diverged");
  const record=await new Promise<unknown>((resolve,reject)=>{const tx=db.transaction(store,"readonly"),s=tx.objectStore(store);let value:unknown,count:number|undefined,read=false,reason:unknown;
   const fail=(error:unknown)=>{reason=error;try{tx.abort();}catch{}};
   if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){fail(operationFailure("operation_diverged"));}
   else{const check=()=>{if(read&&count!==undefined&&(count!==1||value===undefined))fail(operationFailure("operation_missing"));};const r=s.get(key),c=s.count();r.onsuccess=()=>{value=r.result;read=true;check();};c.onsuccess=()=>{count=c.result;check();};}
   tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(reason??operationFailure());
  });assertCurrent();return{db,record,assertCurrent};
 }catch(error){db.close();throw error;}
}
