import {SharedEditorError} from "../core.js";
export const MAX_CHECKPOINT_BYTES=16*1024*1024;
/** Versioned exact journals only. Asset bytes and relay acknowledgement state are separate stores. */
export function openSessionDatabase(name:string):Promise<IDBDatabase>{
 if(!name||name.length>200)throw new SharedEditorError("session_database","Session database name must contain 1–200 characters");
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(name,1);let blocked=false;
  request.onupgradeneeded=()=>{request.result.createObjectStore("journals");};
  request.onerror=()=>reject(request.error??new SharedEditorError("session_database","Cannot open shared session storage"));
  request.onblocked=()=>{blocked=true;reject(new SharedEditorError("session_blocked","Shared session upgrade is blocked"));};
  request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
 });
}
export function checkCheckpoint(value:string,room:string,writer:string):void{
 if(typeof value!=="string"||new TextEncoder().encode(value).length>MAX_CHECKPOINT_BYTES)throw new SharedEditorError("session_budget","Shared journal exceeds its 16 MiB storage budget");
 const header=JSON.parse(value) as {format?:unknown;version?:unknown;document?:unknown;writer?:unknown};
 if(header.format!=="breditor/rich-replica-journal"||header.version!==8||header.document!==room||header.writer!==writer)throw new SharedEditorError("session_identity","Shared journal does not belong to the leased room/writer/model");
 // This checks storage identity, not causal admission. The matching Rust restore owns that proof.
}
export function readCheckpoint(db:IDBDatabase,key:readonly[string,string]):Promise<string|null>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").get([...key]);let result:string|null=null;
  request.onsuccess=()=>{if(request.result!==undefined&&typeof request.result!=="string"){tx.abort();return;}result=request.result??null;};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error??new SharedEditorError("session_read","Cannot read the exact shared journal"));
 });
}
export function writeCheckpoint(db:IDBDatabase,key:readonly[string,string],value:string):Promise<void>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readwrite");
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("session_write","Shared journal transaction did not complete"));
  try{tx.objectStore("journals").put(value,[...key]);}catch(error){tx.abort();reject(error);}
 });
}
