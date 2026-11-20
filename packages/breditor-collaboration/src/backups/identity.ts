import {SharedEditorError} from "../core.js";
import type {SharedBackupIdentity} from "./types.js";
const keys="history,rangeEditing,richLanguage,room,searchHistory,selectionEditing,writer";
export function backupIdentity(input:unknown):Readonly<SharedBackupIdentity>{
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!==keys)throw new SharedEditorError("backup_identity","Expected an explicit complete backup source policy");
 const r=input as SharedBackupIdentity;
 if(typeof r.room!=="string"||!r.room||r.room.length>200||new TextEncoder().encode(r.room).byteLength>200||typeof r.writer!=="string"||!/^\d{1,20}$/.test(r.writer)||BigInt(r.writer)<1n||BigInt(r.writer)>=18446744073709551615n||BigInt(r.writer).toString()!==r.writer||![1,2,3,4].includes(r.richLanguage)||(r.history!=="explicit"&&r.history!=="typing-v1")||(r.rangeEditing!=="original"&&r.rangeEditing!=="general-v1")||(r.selectionEditing!=="original"&&r.selectionEditing!=="document-v1")||(r.selectionEditing==="document-v1"&&r.rangeEditing!=="general-v1")||(r.searchHistory!==null&&r.searchHistory!=="search-v1"))throw new SharedEditorError("backup_identity","Backup source policy is invalid or incompatible");
 if(new TextDecoder("utf-8",{fatal:true}).decode(new TextEncoder().encode(r.room))!==r.room)throw new SharedEditorError("backup_identity","Backup room must be well-formed Unicode");
 return Object.freeze({room:r.room,writer:r.writer,richLanguage:r.richLanguage,history:r.history,rangeEditing:r.rangeEditing,selectionEditing:r.selectionEditing,searchHistory:r.searchHistory});
}
export function sameBackupIdentity(a:SharedBackupIdentity,b:SharedBackupIdentity):boolean{return JSON.stringify(a)===JSON.stringify(b);}
export function requireBackupRecovery(value:unknown):void{if(value!=="host-reacquired")throw new SharedEditorError("backup_writer_recovery","The host must explicitly reacquire/fence this writer before restoring a live session");}
