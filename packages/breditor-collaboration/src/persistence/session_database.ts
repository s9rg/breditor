import {settleOwnedTransaction} from "./settle_owned_transaction.js";
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
export function checkCheckpoint(value:string,room:string,writer:string,language:1|2|3|4=1,history:SharedHistoryPolicy="explicit",rangeEditing:SharedRangePolicy="original"):void{
 if(typeof value!=="string"||new TextEncoder().encode(value).length>MAX_CHECKPOINT_BYTES)throw new SharedEditorError("session_budget","Shared journal exceeds its 16 MiB storage budget");
 const decoded:unknown=JSON.parse(value);
 if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw new SharedEditorError("session_identity","Expected a shared journal object");
 const valueHeader=decoded as {format?:unknown;formatVersion?:unknown;modelVersion?:unknown;journalVersion?:unknown;version?:unknown;document?:unknown;writer?:unknown;journal?:{format?:unknown;version?:unknown;document?:unknown;writer?:unknown}};
 const grouped=history==="typing-v1",general=rangeEditing==="general-v1",header=grouped?valueHeader.journal:valueHeader;
 const model=language===4?14:language===3?13:language===2?12:11,journal=language===4?15:language===3?14:language===2?13:12;
 if((language!==1&&language!==2&&language!==3&&language!==4)||(history!=="explicit"&&!grouped)||(rangeEditing!=="original"&&!general)||!header||
  grouped&&(valueHeader.format!==(general?"breditor/shared-general-typing-session":"breditor/shared-typing-session")||valueHeader.formatVersion!==1||valueHeader.modelVersion!==model||valueHeader.journalVersion!==journal)||
  header.format!==(general?(grouped?"breditor/rich-replica-general-typing-journal":"breditor/rich-replica-general-journal"):(grouped?"breditor/rich-replica-typing-journal":"breditor/rich-replica-journal"))||header.version!==((general||grouped)?1:journal)||header.document!==room||header.writer!==writer)throw new SharedEditorError("session_identity","Shared journal does not belong to the leased room/writer/model/history/range policy");
 // This checks storage identity, not causal admission. The matching Rust restore owns that proof.
}
export type StoredSessionCheckpoint=
 |{history:SharedHistoryPolicy;json:string;rangeEditing?:never;richLanguage?:never}
 |{history:SharedHistoryPolicy;json:string;rangeEditing:"general-v1";richLanguage:1|2|3|4};
/** Separate declared record; original readers never infer document scope from opaque JSON. */
export type StoredDocumentSessionCheckpoint=StoredSessionCheckpoint|{history:SharedHistoryPolicy;json:string;rangeEditing:"general-v1";selectionEditing:"document-v1";richLanguage:1|2|3|4};
/** Storage identity only; the separate native document factory still proves exact replay. */
export function checkDocumentCheckpoint(value:string,room:string,writer:string,language:1|2|3|4=1,history:SharedHistoryPolicy="explicit"):void{
 if(typeof value!=="string"||new TextEncoder().encode(value).length>MAX_CHECKPOINT_BYTES)throw new SharedEditorError("session_budget","Shared journal exceeds its 16 MiB storage budget");
 const decoded:unknown=JSON.parse(value);
 if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw new SharedEditorError("session_identity","Expected a shared document journal object");
 const envelope=decoded as {format?:unknown;formatVersion?:unknown;modelVersion?:unknown;journalVersion?:unknown;version?:unknown;document?:unknown;writer?:unknown;journal?:{format?:unknown;version?:unknown;document?:unknown;writer?:unknown}};
 const grouped=history==="typing-v1",header=grouped?envelope.journal:envelope,model=language===4?14:language===3?13:language===2?12:11,journal=language===4?15:language===3?14:language===2?13:12;
 if((language!==1&&language!==2&&language!==3&&language!==4)||(history!=="explicit"&&!grouped)||!header||
  grouped&&(envelope.format!=="breditor/shared-document-typing-session"||envelope.formatVersion!==1||envelope.modelVersion!==model||envelope.journalVersion!==journal)||
  header.format!==(grouped?"breditor/rich-replica-document-typing-journal":"breditor/rich-replica-document-journal")||header.version!==1||header.document!==room||header.writer!==writer)throw new SharedEditorError("session_identity","Shared document journal does not belong to the leased room/writer/model/history/selection policy");
}
/** Legacy strings declare original history. New records declare their family outside opaque Rust JSON. */
export function readSessionCheckpoint(db:IDBDatabase,key:readonly[string,string]):Promise<StoredSessionCheckpoint|null>{
 return readStoredSessionCheckpoint(db,key,false);
}
/** Explicit document sessions can read old records for an atomic, caller-selected upgrade. */
export function readDocumentSessionCheckpoint(db:IDBDatabase,key:readonly[string,string]):Promise<StoredDocumentSessionCheckpoint|null>{
 return readStoredSessionCheckpoint(db,key,true);
}
function readStoredSessionCheckpoint(db:IDBDatabase,key:readonly[string,string],document:false):Promise<StoredSessionCheckpoint|null>;
function readStoredSessionCheckpoint(db:IDBDatabase,key:readonly[string,string],document:true):Promise<StoredDocumentSessionCheckpoint|null>;
function readStoredSessionCheckpoint(db:IDBDatabase,key:readonly[string,string],document:boolean):Promise<StoredDocumentSessionCheckpoint|null>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").getAll([...key],1);let result:StoredDocumentSessionCheckpoint|null=null,failure:unknown;
  // An occupied key with an undefined value is malformed, not an empty session.
  request.onsuccess=()=>{try{
   if(request.result.length===0)return;
   const value:unknown=request.result[0];
   if(typeof value==="string"){result={history:"explicit",json:value};return;}
   if(!value||typeof value!=="object"||Array.isArray(value))throw new SharedEditorError("session_read","Unknown stored shared history record");
   const record=value as Record<string,unknown>;
   if(document&&record["format"]==="breditor/shared-document-checkpoint-record"){
    if(Object.keys(record).sort().join(",")!=="checkpointJson,format,formatVersion,history,richLanguage"||record["formatVersion"]!==1||typeof record["checkpointJson"]!=="string"||(record["history"]!=="explicit"&&record["history"]!=="typing-v1")||(record["richLanguage"]!==1&&record["richLanguage"]!==2&&record["richLanguage"]!==3&&record["richLanguage"]!==4))throw new SharedEditorError("session_read","Unknown stored shared document history record");
    result={history:record["history"],json:record["checkpointJson"],rangeEditing:"general-v1",selectionEditing:"document-v1",richLanguage:record["richLanguage"]};return;
   }
   if(record["format"]==="breditor/shared-general-checkpoint-record"){
    if(Object.keys(record).sort().join(",")!=="checkpointJson,format,formatVersion,history,richLanguage"||record["formatVersion"]!==1||typeof record["checkpointJson"]!=="string"||(record["history"]!=="explicit"&&record["history"]!=="typing-v1")||(record["richLanguage"]!==1&&record["richLanguage"]!==2&&record["richLanguage"]!==3&&record["richLanguage"]!==4))throw new SharedEditorError("session_read","Unknown stored shared general history record");
    result={history:record["history"],json:record["checkpointJson"],rangeEditing:"general-v1",richLanguage:record["richLanguage"]};return;
   }
   if(Object.keys(record).sort().join(",")!=="checkpointJson,format,formatVersion"||record["format"]!=="breditor/shared-typing-checkpoint-record"||record["formatVersion"]!==1||typeof record["checkpointJson"]!=="string")throw new SharedEditorError("session_read","Unknown stored shared history record");
   result={history:"typing-v1",json:record["checkpointJson"]};
  }catch(error){failure=error;tx.abort();}};
  settleOwnedTransaction(tx,()=>result,()=>failure??tx.error??new SharedEditorError("session_read","Cannot read the exact shared journal"),resolve,reject);
 });
}
/** Commit only a closed document-family record after validating its declared storage identity. */
export function writeDocumentSessionCheckpoint(db:IDBDatabase,key:readonly[string,string],value:string,history:SharedHistoryPolicy,language:1|2|3|4=1,insertOnly=false):Promise<void>{
 try{checkDocumentCheckpoint(value,key[0],key[1],language,history);}catch(error){return Promise.reject(error);}
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("session_write","Shared document journal transaction did not complete"));
  try{tx.objectStore("journals")[insertOnly?"add":"put"]({format:"breditor/shared-document-checkpoint-record",formatVersion:1,history,richLanguage:language,checkpointJson:value},[...key]);}catch(error){tx.abort();reject(error);}
 });
}
/** Explicit sessions keep byte-identical legacy values; grouping uses a declared storage discriminator. */
export function writeSessionCheckpoint(db:IDBDatabase,key:readonly[string,string],value:string,history:SharedHistoryPolicy,rangeEditing:SharedRangePolicy="original",language:1|2|3|4=1,insertOnly=false):Promise<void>{
 if(rangeEditing!=="original"&&rangeEditing!=="general-v1")return Promise.reject(new SharedEditorError("session_range","Unknown range policy"));
 if(rangeEditing==="original"&&history==="explicit")return writeCheckpoint(db,key,value,insertOnly);
 if(history!=="typing-v1"&&!(rangeEditing==="general-v1"&&history==="explicit"))return Promise.reject(new SharedEditorError("session_history","Unknown history policy"));
 if(rangeEditing==="general-v1"){try{checkCheckpoint(value,key[0],key[1],language,history,rangeEditing);}catch(error){return Promise.reject(error);}}
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("session_write","Shared journal transaction did not complete"));
  try{tx.objectStore("journals")[insertOnly?"add":"put"](rangeEditing==="general-v1"?{format:"breditor/shared-general-checkpoint-record",formatVersion:1,history,richLanguage:language,checkpointJson:value}:{format:"breditor/shared-typing-checkpoint-record",formatVersion:1,checkpointJson:value},[...key]);}catch(error){tx.abort();reject(error);}
 });
}
export function readCheckpoint(db:IDBDatabase,key:readonly[string,string]):Promise<string|null>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").getAll([...key],1);let result:string|null=null;
  request.onsuccess=()=>{
   if(request.result.length===0)return;
   const value:unknown=request.result[0];
   if(typeof value!=="string"){tx.abort();return;}
   result=value;
  };
  settleOwnedTransaction(tx,()=>result,()=>tx.error??new SharedEditorError("session_read","Cannot read the exact shared journal"),resolve,reject);
 });
}
export function writeCheckpoint(db:IDBDatabase,key:readonly[string,string],value:string,insertOnly=false):Promise<void>{
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readwrite");
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("session_write","Shared journal transaction did not complete"));
  try{tx.objectStore("journals")[insertOnly?"add":"put"](value,[...key]);}catch(error){tx.abort();reject(error);}
 });
}
