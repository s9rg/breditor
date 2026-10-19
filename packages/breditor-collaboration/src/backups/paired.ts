import {SharedEditorError} from "../core.js";
import type {SharedPairedCheckpointRecord} from "../persistence/review_session.js";
import {checkReviewRecord} from "../persistence/review_database.js";
import {checkReviewRelayRecord} from "../persistence/review_relay_database.js";
import {checkReviewObserverRecord} from "../persistence/review_observer_database.js";
import {checkReviewedReviewRecord} from "../persistence/reviewed_review_database.js";
import {checkSearchReviewRecord} from "../persistence/search_review_database.js";
import {backupIdentity,sameBackupIdentity} from "./identity.js";
import {backupDigest,backupJson,backupUtf8} from "./encoding.js";
import type {SharedBackupIdentity} from "./types.js";
export interface SharedPairedSessionBackup {readonly format:"breditor/shared-paired-session-backup";readonly formatVersion:1;readonly identity:Readonly<SharedBackupIdentity>;readonly recordJson:string;readonly sha256:string}
export const MAX_SHARED_PAIRED_BACKUP_BYTES=65*1024*1024;
const MAX_PAIRED_RECORD_BYTES=32*1024*1024;
/** Existing storage identity/budgets only. The chosen native factory must prove both histories. */
export function readPairedBackupRecord(recordJson:string,identity:SharedBackupIdentity):SharedPairedCheckpointRecord {
 const value=backupJson(recordJson,MAX_PAIRED_RECORD_BYTES);
 try{
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error();const r=value as SharedPairedCheckpointRecord,key:[string,string]=[identity.room,identity.writer];
  if(r.history!==identity.history||r.rangeEditing!==identity.rangeEditing||r.selectionEditing!==identity.selectionEditing||r.richLanguage!==identity.richLanguage||(r.format==="breditor/shared-search-review-checkpoint-record")!==(identity.searchHistory==="search-v1"))throw Error();
  switch(r.format){case "breditor/shared-review-checkpoint-record":checkReviewRecord(r,key);break;case "breditor/shared-review-relay-checkpoint-record":checkReviewRelayRecord(r,key);break;case "breditor/shared-review-observer-checkpoint-record":checkReviewObserverRecord(r,key);break;case "breditor/shared-reviewed-review-checkpoint-record":checkReviewedReviewRecord(r,key);break;case "breditor/shared-search-review-checkpoint-record":checkSearchReviewRecord(r,key);break;default:throw Error();}return r;
 }catch{throw new SharedEditorError("backup_paired_identity","Paired backup does not match the closed session policy and record budgets");}
}
function body(identity:Readonly<SharedBackupIdentity>,recordJson:string){return{format:"breditor/shared-paired-session-backup" as const,formatVersion:1 as const,identity,recordJson};}
/** Includes both native histories, local immutable versions and selected nonsecret relay progress, not other stores. */
export async function encodeSharedPairedSessionBackup(source:SharedBackupIdentity,record:SharedPairedCheckpointRecord):Promise<string>{
 const identity=backupIdentity(source);let recordJson:string;try{recordJson=JSON.stringify(record);}catch{throw new SharedEditorError("backup_format","Paired backup record is not JSON");}readPairedBackupRecord(recordJson,identity);const payload=body(identity,recordJson),sha256=await backupDigest(JSON.stringify(payload),MAX_SHARED_PAIRED_BACKUP_BYTES),encoded=JSON.stringify({...payload,sha256});backupUtf8(encoded,MAX_SHARED_PAIRED_BACKUP_BYTES);return encoded;
}
export async function decodeSharedPairedSessionBackup(input:string,expected:SharedBackupIdentity):Promise<SharedPairedSessionBackup>{
 const identity=backupIdentity(expected),decoded=backupJson(input,MAX_SHARED_PAIRED_BACKUP_BYTES);
 if(!decoded||typeof decoded!=="object"||Array.isArray(decoded)||Object.keys(decoded).sort().join(",")!=="format,formatVersion,identity,recordJson,sha256")throw new SharedEditorError("backup_format","Expected the closed paired session backup V1 format");
 const r=decoded as SharedPairedSessionBackup,source=backupIdentity(r.identity);
 if(r.format!=="breditor/shared-paired-session-backup"||r.formatVersion!==1||typeof r.recordJson!=="string"||typeof r.sha256!=="string"||!/^[0-9a-f]{64}$/.test(r.sha256))throw new SharedEditorError("backup_format","Expected the closed paired session backup V1 format");
 if(!sameBackupIdentity(identity,source))throw new SharedEditorError("backup_identity","Paired backup differs from the explicitly selected recovery source");
 readPairedBackupRecord(r.recordJson,source);const payload=body(source,r.recordJson),digest=await backupDigest(JSON.stringify(payload),MAX_SHARED_PAIRED_BACKUP_BYTES);if(digest!==r.sha256)throw new SharedEditorError("backup_integrity","Paired backup integrity check failed");return Object.freeze({...payload,sha256:digest});
}
