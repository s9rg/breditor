/** Presence-only admission and insert-only commit. No existing dependent record is parsed or replaced. */
import {SharedEditorError} from "../core.js";
import {checkRetainedStoreSignal} from "./retained_store.js";
export function retainedStoreDestinationExists(db:IDBDatabase,store:string,key:IDBValidKey,signal?:AbortSignal):Promise<boolean>{
 checkRetainedStoreSignal(signal);return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,"readonly"),request=tx.objectStore(store).count(key);let exists=false;
  request.onsuccess=()=>{exists=request.result!==0;};tx.oncomplete=()=>{try{checkRetainedStoreSignal(signal);resolve(exists);}catch(error){reject(error);}};tx.onabort=()=>reject(new SharedEditorError("backup_storage","Retained destination presence could not be checked"));
 });
}
export function insertRetainedStoreRecord(db:IDBDatabase,store:string,key:IDBValidKey,value:unknown,signal?:AbortSignal):Promise<void>{
 checkRetainedStoreSignal(signal);return new Promise((resolve,reject)=>{
  let tx:IDBTransaction;try{tx=db.transaction(store,"readwrite",{durability:"strict"});}catch{reject(new SharedEditorError("backup_storage","Retained restore transaction could not start"));return;}
  let failure:unknown;const abort=()=>{failure=new SharedEditorError("backup_aborted","Retained-store recovery was cancelled");try{tx.abort();}catch{/* Commit may already have completed; inspect ordinary startup before retry. */}};
  signal?.addEventListener("abort",abort,{once:true});tx.oncomplete=()=>{signal?.removeEventListener("abort",abort);resolve();};tx.onabort=()=>{signal?.removeEventListener("abort",abort);reject(failure??new SharedEditorError("backup_storage","Retained restore did not commit"));};
  try{checkRetainedStoreSignal(signal);const request=tx.objectStore(store).add(value,key);request.onerror=()=>{if(request.error?.name==="ConstraintError")failure=new SharedEditorError("backup_destination_exists","Retained restore destination already contains a record");};}catch(error){failure=error instanceof SharedEditorError?error:new SharedEditorError("backup_storage","Retained restore insertion could not start");tx.abort();}
 });
}
