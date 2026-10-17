/** Explicit atomic document/review recovery record. Old readers reject it; native Rust proves replay. */
import {SharedEditorError} from "../core.js";
import type {SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from "../types.js";
import {checkCheckpoint,checkDocumentCheckpoint} from "./session_database.js";
export interface ReviewCheckpointRecord {
 format:"breditor/shared-review-checkpoint-record";formatVersion:1;
 history:SharedHistoryPolicy;rangeEditing:SharedRangePolicy;selectionEditing:SharedSelectionPolicy;richLanguage:1|2|3;
 reviewActor:string;principal:string;documentCheckpointJson:string;reviewCheckpointJson:string;versions:readonly string[];
}
const keys="documentCheckpointJson,format,formatVersion,history,principal,rangeEditing,reviewActor,reviewCheckpointJson,richLanguage,selectionEditing,versions";
const bytes=(s:string)=>new TextEncoder().encode(s).byteLength;
/** Identity/budgets only: the real native document/review owners must still admit both exact journals. */
export function checkReviewRecord(input:unknown,key:readonly[string,string]):asserts input is ReviewCheckpointRecord {
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!==keys)throw new SharedEditorError("review_record","Expected an explicitly paired review record");
 const r=input as ReviewCheckpointRecord;
 if(r.format!=="breditor/shared-review-checkpoint-record")throw new SharedEditorError("review_record","Unknown paired review family");
 checkReviewRecordFields(r,key,()=>{if(r.selectionEditing==="document-v1")checkDocumentCheckpoint(r.documentCheckpointJson,...key,r.richLanguage,r.history);else checkCheckpoint(r.documentCheckpointJson,...key,r.richLanguage,r.history,r.rangeEditing);});
}
/** Shared closed-body laws; each separately named family supplies its own document identity guard. */
export function checkReviewRecordFields(r:Omit<ReviewCheckpointRecord,"format">,key:readonly[string,string],checkDocument:()=>void):void {
 if(r.formatVersion!==1||![1,2,3].includes(r.richLanguage)||(r.history!=="explicit"&&r.history!=="typing-v1")||(r.rangeEditing!=="original"&&r.rangeEditing!=="general-v1")||(r.selectionEditing!=="original"&&r.selectionEditing!=="document-v1")||(r.selectionEditing==="document-v1"&&r.rangeEditing!=="general-v1"))throw new SharedEditorError("review_record","Unknown paired review policy");
 if(typeof r.reviewActor!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(r.reviewActor)||typeof r.principal!=="string"||!r.principal.trim()||bytes(r.principal)>256||/[\u0000-\u001f\u007f-\u009f]/u.test(r.principal))throw new SharedEditorError("review_record","Invalid review identity");
 checkDocument();
 if(typeof r.reviewCheckpointJson!=="string"||bytes(r.reviewCheckpointJson)>16*1024*1024)throw new SharedEditorError("review_record_budget","Review journal exceeds its native checkpoint ceiling");
 const header=JSON.parse(r.reviewCheckpointJson) as {format?:unknown;formatVersion?:unknown;actor?:unknown;principal?:unknown;binding?:{document?:unknown}}|null;
 if(!header||typeof header!=="object"||header.format!=="breditor/review-session"||header.formatVersion!==1||header.actor!==r.reviewActor||header.principal!==r.principal||header.binding?.document!==key[0])throw new SharedEditorError("review_record_identity","Review journal does not belong to the paired room/actor/account");
 if(!Array.isArray(r.versions)||r.versions.length>32||r.versions.some(v=>typeof v!=="string"||bytes(v)>4*1024*1024)||bytes(JSON.stringify(r))>32*1024*1024)throw new SharedEditorError("review_record_budget","Paired recovery/version catalog exceeds its closed storage budget");
}
/** Read only the declared paired family. Legacy records require an explicit future migration. */
export function readReviewRecord(db:IDBDatabase,key:readonly[string,string]):Promise<ReviewCheckpointRecord|null> {
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").get([...key]);let result:ReviewCheckpointRecord|null=null,failure:unknown;
  request.onsuccess=()=>{try{if(request.result!==undefined){checkReviewRecord(request.result,key);result=request.result;}}catch(error){failure=error;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure??tx.error??new SharedEditorError("review_record_read","Paired recovery read failed"));
 });
}
/** One committed transaction contains both exact journals and the immutable named-version catalog. */
export function writeReviewRecord(db:IDBDatabase,key:readonly[string,string],record:ReviewCheckpointRecord):Promise<void> {
 try{checkReviewRecord(record,key);}catch(error){return Promise.reject(error);}
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new SharedEditorError("review_record_write","Paired recovery transaction did not complete"));
  try{tx.objectStore("journals").put(record,[...key]);}catch(error){tx.abort();reject(error);}
 });
}
