import {SharedEditorError} from "../core.js";
import type {SharedHistoryPolicy,SharedRangePolicy} from "../types.js";
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
export function checkCheckpoint(value:string,room:string,writer:string,language:1|2|3=1,history:SharedHistoryPolicy="explicit",rangeEditing:SharedRangePolicy="original"):void{
 if(typeof value!=="string"||new TextEncoder().encode(value).length>MAX_CHECKPOINT_BYTES)throw new SharedEditorError("session_budget","Shared journal exceeds its 16 MiB storage budget");
 const decoded:unknown=JSON.parse(value);
 if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw new SharedEditorError("session_identity","Expected a shared journal object");
 const valueHeader=decoded as {format?:unknown;formatVersion?:unknown;modelVersion?:unknown;journalVersion?:unknown;version?:unknown;document?:unknown;writer?:unknown;journal?:{format?:unknown;version?:unknown;document?:unknown;writer?:unknown}};
 const grouped=history==="typing-v1",general=rangeEditing==="general-v1",header=grouped?valueHeader.journal:valueHeader;
 const model=language===3?13:language===2?12:11,journal=language===3?14:language===2?13:12;
 if((language!==1&&language!==2&&language!==3)||(history!=="explicit"&&!grouped)||(rangeEditing!=="original"&&!general)||!header||
  grouped&&(valueHeader.format!==(general?"breditor/shared-general-typing-session":"breditor/shared-typing-session")||valueHeader.formatVersion!==1||valueHeader.modelVersion!==model||valueHeader.journalVersion!==journal)||
  header.format!==(general?(grouped?"breditor/rich-replica-general-typing-journal":"breditor/rich-replica-general-journal"):(grouped?"breditor/rich-replica-typing-journal":"breditor/rich-replica-journal"))||header.version!==((general||grouped)?1:journal)||header.document!==room||header.writer!==writer)throw new SharedEditorError("session_identity","Shared journal does not belong to the leased room/writer/model/history/range policy");
 // This checks storage identity, not causal admission. The matching Rust restore owns that proof.
}
export type StoredSessionCheckpoint=
 |{history:SharedHistoryPolicy;json:string;rangeEditing?:never;richLanguage?:never}
 |{history:SharedHistoryPolicy;json:string;rangeEditing:"general-v1";richLanguage:1|2|3};
/** Legacy strings declare original history. New records declare their family outside opaque Rust JSON. */
export function readSessionCheckpoint(db:IDBDatabase,key:readonly[string,string]):Promise<StoredSessionCheckpoint|null>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").get([...key]);let result:StoredSessionCheckpoint|null=null,failure:unknown;
  request.onsuccess=()=>{try{const value:unknown=request.result;
   if(value===undefined)return;
   if(typeof value==="string"){result={history:"explicit",json:value};return;}
   if(!value||typeof value!=="object"||Array.isArray(value))throw new SharedEditorError("session_read","Unknown stored shared history record");
   const record=value as Record<string,unknown>;
   if(record["format"]==="breditor/shared-general-checkpoint-record"){
    if(Object.keys(record).sort().join(",")!=="checkpointJson,format,formatVersion,history,richLanguage"||record["formatVersion"]!==1||typeof record["checkpointJson"]!=="string"||(record["history"]!=="explicit"&&record["history"]!=="typing-v1")||(record["richLanguage"]!==1&&record["richLanguage"]!==2&&record["richLanguage"]!==3))throw new SharedEditorError("session_read","Unknown stored shared general history record");
    result={history:record["history"],json:record["checkpointJson"],rangeEditing:"general-v1",richLanguage:record["richLanguage"]};return;
   }
   if(Object.keys(record).sort().join(",")!=="checkpointJson,format,formatVersion"||record["format"]!=="breditor/shared-typing-checkpoint-record"||record["formatVersion"]!==1||typeof record["checkpointJson"]!=="string")throw new SharedEditorError("session_read","Unknown stored shared history record");
   result={history:"typing-v1",json:record["checkpointJson"]};
  }catch(error){failure=error;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure??tx.error??new SharedEditorError("session_read","Cannot read the exact shared journal"));
 });
}
/** Explicit sessions keep byte-identical legacy values; grouping uses a declared storage discriminator. */
export function writeSessionCheckpoint(db:IDBDatabase,key:readonly[string,string],value:string,history:SharedHistoryPolicy,rangeEditing:SharedRangePolicy="original",language:1|2|3=1):Promise<void>{
 if(rangeEditing!=="original"&&rangeEditing!=="general-v1")return Promise.reject(new SharedEditorError("session_range","Unknown range policy"));
 if(rangeEditing==="original"&&history==="explicit")return writeCheckpoint(db,key,value);
 if(history!=="typing-v1"&&!(rangeEditing==="general-v1"&&history==="explicit"))return Promise.reject(new SharedEditorError("session_history","Unknown history policy"));
 if(rangeEditing==="general-v1"){try{checkCheckpoint(value,key[0],key[1],language,history,rangeEditing);}catch(error){return Promise.reject(error);}}
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("session_write","Shared journal transaction did not complete"));
  try{tx.objectStore("journals").put(rangeEditing==="general-v1"?{format:"breditor/shared-general-checkpoint-record",formatVersion:1,history,richLanguage:language,checkpointJson:value}:{format:"breditor/shared-typing-checkpoint-record",formatVersion:1,checkpointJson:value},[...key]);}catch(error){tx.abort();reject(error);}
 });
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
