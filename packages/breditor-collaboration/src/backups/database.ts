import {SharedEditorError} from "../core.js";
import type {SharedBackupIdentity} from "./types.js";
import {checkBackupCheckpoint} from "./session.js";
/** Presence only: an unfamiliar destination is never parsed or treated as an empty seed. */
export function backupDestinationExists(db:IDBDatabase,key:readonly[string,string]):Promise<boolean>{
 return new Promise((resolve,reject)=>{const tx=db.transaction("journals","readonly"),request=tx.objectStore("journals").count([...key]);let exists=false;request.onsuccess=()=>{exists=request.result!==0;};tx.oncomplete=()=>resolve(exists);tx.onabort=()=>reject(new SharedEditorError("backup_storage","Backup destination could not be checked"));});
}
/** Add, never put: even a competing noncooperative writer cannot be overwritten between read/admission/commit. */
export function insertBackupRecord(db:IDBDatabase,key:readonly[string,string],record:unknown):Promise<void>{
 return new Promise((resolve,reject)=>{
  let failure:unknown;const tx=db.transaction("journals","readwrite");tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??(tx.error?.name==="ConstraintError"?new SharedEditorError("backup_destination_exists","Backup destination already contains a record"):new SharedEditorError("backup_storage","Backup insertion did not commit")));
  try{const request=tx.objectStore("journals").add(record,[...key]);request.onerror=()=>{if(request.error?.name==="ConstraintError")failure=new SharedEditorError("backup_destination_exists","Backup destination already contains a record");};}catch{failure=new SharedEditorError("backup_storage","Backup insertion could not start");tx.abort();}
 });
}
/** The existing stored families are retained byte-for-byte; only their first insertion is conditional. */
export function insertSessionBackup(db:IDBDatabase,checkpointJson:string,identity:SharedBackupIdentity):Promise<void>{
 checkBackupCheckpoint(checkpointJson,identity);const key:[string,string]=[identity.room,identity.writer];
 if(identity.searchHistory)return insertBackupRecord(db,key,{format:"breditor/shared-search-checkpoint-record",formatVersion:1,history:identity.history,rangeEditing:identity.rangeEditing,selectionEditing:identity.selectionEditing,richLanguage:identity.richLanguage,checkpointJson});
 if(identity.selectionEditing==="document-v1")return insertBackupRecord(db,key,{format:"breditor/shared-document-checkpoint-record",formatVersion:1,history:identity.history,richLanguage:identity.richLanguage,checkpointJson});
 if(identity.rangeEditing==="general-v1")return insertBackupRecord(db,key,{format:"breditor/shared-general-checkpoint-record",formatVersion:1,history:identity.history,richLanguage:identity.richLanguage,checkpointJson});
 return insertBackupRecord(db,key,identity.history==="explicit"?checkpointJson:{format:"breditor/shared-typing-checkpoint-record",formatVersion:1,checkpointJson});
}
