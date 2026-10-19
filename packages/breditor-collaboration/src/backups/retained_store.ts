/** Exact separate retained-store archive. Existing persisted record families/limits stay unchanged. */
import {SharedEditorError} from "../core.js";
import {backupDigest,backupJson,backupUtf8} from "./encoding.js";
import type {SharedRetainedStoreKind,SharedRetainedStoreBackup,SharedRetainedStoreBackupOptions,SharedRetainedStoreRecovery,SharedRetainedStoreBackupSource} from "./retained_store_types.js";
import {checkQueueRecord} from "../suggestions/database.js";
import {queueIdentity} from "../suggestions/validation.js";
import {checkRevisionRecord} from "../suggestion_revisions/database.js";
import {revisionsBinding} from "../suggestion_revisions/transport.js";
import {checkCatalogRecord} from "../versions/database.js";
import {versionIdentity} from "../versions/validation.js";
export const MAX_SHARED_RETAINED_STORE_BACKUP_BYTES=65*1024*1024;
const MAX_RECORD_BYTES=32*1024*1024;
const kinds=new Set<SharedRetainedStoreKind>(["suggestions","suggestion-revisions","version-catalog"]);
export function checkRetainedStoreSignal(signal?:AbortSignal):void{if(signal?.aborted)throw new SharedEditorError("backup_aborted","Retained-store recovery was cancelled");}
export function checkRetainedStoreRecovery(input:SharedRetainedStoreRecovery):void{if(input.writerRecovery!=="host-reacquired")throw new SharedEditorError("backup_policy","Explicit host-reacquired writer authority is required");checkRetainedStoreSignal(input.signal);}
function body(kind:SharedRetainedStoreKind,recordJson:string){return {format:"breditor/shared-retained-store-backup" as const,formatVersion:1 as const,kind,recordJson};}
function record<T>(recordJson:string,validate:(value:unknown)=>T):T{
 const raw=backupJson(recordJson,MAX_RECORD_BYTES);let checked:T;
 try{checked=validate(raw);}catch{throw new SharedEditorError("backup_record_identity","Retained record differs from the explicitly selected source policy");}
 if(JSON.stringify(checked)!==recordJson)throw new SharedEditorError("backup_format","Retained record must preserve its exact canonical recovery JSON");return checked;
}
/** Snapshot/structural validation happen synchronously before the first await; no storage is flushed. */
export async function encodeRetainedStoreBackup<T>(kind:SharedRetainedStoreKind,value:T,validate:(value:unknown)=>T,options:SharedRetainedStoreBackupOptions={}):Promise<string>{
 const {signal}={...options};checkRetainedStoreSignal(signal);if(!kinds.has(kind))throw new SharedEditorError("backup_format","Unknown retained-store archive kind");
 let recordJson:string;try{recordJson=JSON.stringify(value);}catch{throw new SharedEditorError("backup_format","Retained recovery record is not JSON");}record(recordJson,validate);
 const payload=body(kind,recordJson),sha256=await backupDigest(JSON.stringify(payload),MAX_SHARED_RETAINED_STORE_BACKUP_BYTES);checkRetainedStoreSignal(signal);const encoded=JSON.stringify({...payload,sha256});backupUtf8(encoded,MAX_SHARED_RETAINED_STORE_BACKUP_BYTES);return encoded;
}
/** Pure decoding; native ownership/source proof and empty-destination insertion remain separate. */
export async function decodeRetainedStoreBackup<T>(kind:SharedRetainedStoreKind,input:string,validate:(value:unknown)=>T,signal?:AbortSignal):Promise<T>{
 checkRetainedStoreSignal(signal);const raw=backupJson(input,MAX_SHARED_RETAINED_STORE_BACKUP_BYTES);
 if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).sort().join(",")!=="format,formatVersion,kind,recordJson,sha256")throw new SharedEditorError("backup_format","Expected the closed retained-store backup V1 envelope");
 const value=raw as SharedRetainedStoreBackup;if(value.format!=="breditor/shared-retained-store-backup"||value.formatVersion!==1||value.kind!==kind||!kinds.has(kind)||typeof value.recordJson!=="string"||typeof value.sha256!=="string"||!/^[a-f0-9]{64}$/.test(value.sha256))throw new SharedEditorError("backup_format","Expected the selected retained-store backup V1 kind");
 backupUtf8(value.recordJson,MAX_RECORD_BYTES);const payload=body(kind,value.recordJson),sha256=await backupDigest(JSON.stringify(payload),MAX_SHARED_RETAINED_STORE_BACKUP_BYTES);checkRetainedStoreSignal(signal);
 if(sha256!==value.sha256)throw new SharedEditorError("backup_integrity","Retained-store backup integrity check failed");
 if(JSON.stringify({...payload,sha256})!==input)throw new SharedEditorError("backup_format","Retained-store envelope must preserve its canonical V1 bytes");return record(value.recordJson,validate);
}
/** Fixed diagnostic: never return private native packet/title/intent strings from restore admission. */
export function retainedStoreNativeAdmission<T>(run:()=>T):T{try{return run();}catch{throw new SharedEditorError("backup_native_admission","The matching native source did not admit this retained recovery record");}}

/** Wrap exact captured records for the existing insert-only factories. Not native proof or authority. */
export async function encodeSharedRetainedStoreBackup(source:SharedRetainedStoreBackupSource,recordJson:string,options:SharedRetainedStoreBackupOptions={}):Promise<string>{
 checkRetainedStoreSignal(options.signal);
 if(!source||typeof source!=="object"||!kinds.has(source.kind))throw new SharedEditorError("backup_policy","Choose an explicit retained-store source identity and kind");
 switch(source.kind){
  case "suggestions":{const identity=queueIdentity(source.identity),history=source.ownedHistory,validate=(value:unknown)=>checkQueueRecord(value,identity,history);return encodeRetainedStoreBackup(source.kind,record(recordJson,validate),validate,options);}
  case "suggestion-revisions":{const identity=queueIdentity(source.identity),binding=revisionsBinding({binding:source.binding}).binding,validate=(value:unknown)=>checkRevisionRecord(value,identity,binding);return encodeRetainedStoreBackup(source.kind,record(recordJson,validate),validate,options);}
  case "version-catalog":{const identity=versionIdentity(source.identity),validate=(value:unknown)=>checkCatalogRecord(value,identity);return encodeRetainedStoreBackup(source.kind,record(recordJson,validate),validate,options);}
 }
}
