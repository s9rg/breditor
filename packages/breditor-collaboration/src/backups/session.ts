import {SharedEditorError} from "../core.js";
import {MAX_CHECKPOINT_BYTES,checkCheckpoint,checkDocumentCheckpoint} from "../persistence/session_database.js";
import {checkSearchCheckpoint} from "../persistence/search_checkpoint.js";
import {backupIdentity,sameBackupIdentity} from "./identity.js";
import {backupDigest,backupJson,backupUtf8} from "./encoding.js";
import type {SharedBackupIdentity,SharedSessionBackup} from "./types.js";
/** Transport overhead only. The opaque native checkpoint still has its unchanged 16 MiB ceiling. */
export const MAX_SHARED_SESSION_BACKUP_BYTES=33*1024*1024;
function body(identity:Readonly<SharedBackupIdentity>,checkpointJson:string){return{format:"breditor/shared-session-backup" as const,formatVersion:1 as const,identity,checkpointJson};}
export function checkBackupCheckpoint(checkpoint:string,identity:SharedBackupIdentity):void{
 backupUtf8(checkpoint,MAX_CHECKPOINT_BYTES);
 try{if(identity.searchHistory)checkSearchCheckpoint(checkpoint,identity.room,identity.writer,identity.richLanguage,identity.history,identity.rangeEditing,identity.selectionEditing);else if(identity.selectionEditing==="document-v1")checkDocumentCheckpoint(checkpoint,identity.room,identity.writer,identity.richLanguage,identity.history);else checkCheckpoint(checkpoint,identity.room,identity.writer,identity.richLanguage,identity.history,identity.rangeEditing);}
 catch{throw new SharedEditorError("backup_checkpoint_identity","Backup checkpoint does not match its explicitly selected source policy");}
}
/** Encodes exact already-captured native bytes. Does not flush, grant permissions or prove native replay. */
export async function encodeSharedSessionBackup(source:SharedBackupIdentity,checkpointJson:string):Promise<string>{
 const identity=backupIdentity(source);checkBackupCheckpoint(checkpointJson,identity);const payload=body(identity,checkpointJson),sha256=await backupDigest(JSON.stringify(payload),MAX_SHARED_SESSION_BACKUP_BYTES),encoded=JSON.stringify({...payload,sha256});backupUtf8(encoded,MAX_SHARED_SESSION_BACKUP_BYTES);return encoded;
}
/** Pure integrity/identity read. Only a matching native factory can subsequently prove replay. */
export async function decodeSharedSessionBackup(input:string,expected:SharedBackupIdentity):Promise<SharedSessionBackup>{
 const identity=backupIdentity(expected),decoded=backupJson(input,MAX_SHARED_SESSION_BACKUP_BYTES);
 if(!decoded||typeof decoded!=="object"||Array.isArray(decoded)||Object.keys(decoded).sort().join(",")!=="checkpointJson,format,formatVersion,identity,sha256")throw new SharedEditorError("backup_format","Expected the closed shared session backup V1 format");
 const r=decoded as SharedSessionBackup,source=backupIdentity(r.identity);
 if(r.format!=="breditor/shared-session-backup"||r.formatVersion!==1||typeof r.checkpointJson!=="string"||typeof r.sha256!=="string"||!/^[0-9a-f]{64}$/.test(r.sha256))throw new SharedEditorError("backup_format","Expected the closed shared session backup V1 format");
 if(!sameBackupIdentity(identity,source))throw new SharedEditorError("backup_identity","Backup differs from the explicitly selected recovery source");
 checkBackupCheckpoint(r.checkpointJson,source);const payload=body(source,r.checkpointJson),digest=await backupDigest(JSON.stringify(payload),MAX_SHARED_SESSION_BACKUP_BYTES);
 if(digest!==r.sha256)throw new SharedEditorError("backup_integrity","Backup integrity check failed");
 return Object.freeze({...payload,sha256:digest});
}
