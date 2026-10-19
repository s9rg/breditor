import {participantAuthority} from "../participant_backup/policy.js";
import type {SharedRoomRecoveryCatalogSelection,SharedRoomRecoveryFileIdentity} from "./types.js";
/** Catalog-only envelope bounds. Original component readers retain all of their own ceilings. */
export const MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES=4096;
export const MAX_SHARED_ROOM_RECOVERY_CATALOG_BYTES=16*1024*1024*1024;
export const MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES=16*1024*1024;
export const MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES=1024*1024*1024;
export class SharedRoomRecoveryCatalogError extends Error {
 constructor(readonly code:"catalog_policy"|"catalog_budget"|"catalog_integrity"|"catalog_storage"|"catalog_exists"|"catalog_missing"|"catalog_diverged"|"catalog_in_use"|"catalog_closed"|"catalog_aborted"|"catalog_authority"|"catalog_restore"|"catalog_source",message:string){super(message);this.name="SharedRoomRecoveryCatalogError";}
}
export const failure=(code:SharedRoomRecoveryCatalogError["code"]="catalog_storage")=>new SharedRoomRecoveryCatalogError(code,{
 catalog_policy:"Select an explicit complete room recovery catalog and trusted recovery factories",catalog_budget:"Room recovery catalog inputs exceed their independent envelope budgets",catalog_integrity:"Catalog bytes differ from the independently selected files",catalog_storage:"The room catalog transaction did not complete",catalog_exists:"A room catalog never overwrites an existing database",catalog_missing:"A selected catalog or completed participant is missing",catalog_diverged:"Retained room recovery state differs from the selected catalog or explicit plan",catalog_in_use:"The catalog, recovery attempt or original writer is already held",catalog_closed:"The room catalog handle is closed or was not admitted",catalog_aborted:"Room catalog work was cancelled",catalog_authority:"The current host recovery authority did not hold synchronously",catalog_restore:"The original participant could not be restored and verified",catalog_source:"The selected participant histories do not match the native room inventory"
}[code]);
export function object(value:unknown,keys:string):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!==keys)throw failure("catalog_policy");return value as Record<string,unknown>;}
export function id(value:unknown):string{if(typeof value!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value))throw failure("catalog_policy");return value;}
export function databaseName(value:unknown):string{if(typeof value!=="string"||!value||value.length>200)throw failure("catalog_policy");return value;}
export function sha(value:unknown):string{if(typeof value!=="string"||!/^[a-f0-9]{64}$/.test(value))throw failure("catalog_policy");return value;}
export function bytes(value:unknown,max:number):number{if(typeof value!=="number"||!Number.isSafeInteger(value)||value<1||value>max)throw failure("catalog_budget");return value;}
export function selected(value:unknown):SharedRoomRecoveryCatalogSelection{const r=object(value,"catalog,sha256");return Object.freeze({catalog:id(r["catalog"]),sha256:sha(r["sha256"])});}
export function fileIdentity(value:unknown,max:number):SharedRoomRecoveryFileIdentity{const r=object(value,"bytes,sha256");return Object.freeze({bytes:bytes(r["bytes"],max),sha256:sha(r["sha256"])});}
export function signalCheck(signal?:AbortSignal):void{if(signal?.aborted)throw failure("catalog_aborted");}
export function authority(check:()=>void):()=>void{let run:()=>void;try{run=participantAuthority(check);}catch{throw failure("catalog_authority");}return()=>{try{run();}catch{throw failure("catalog_authority");}};}
export async function digest(file:Blob,guard:()=>void):Promise<string>{guard();if(!globalThis.crypto?.subtle)throw failure("catalog_policy");const data=await file.arrayBuffer();guard();const result=await crypto.subtle.digest("SHA-256",data);guard();return [...new Uint8Array(result)].map(b=>b.toString(16).padStart(2,"0")).join("");}
export function copyFile(file:unknown,max:number):Blob{if(!(file instanceof Blob))throw failure("catalog_policy");bytes(file.size,max);return new Blob([file]);}
export const fileKey=(kind:"server"|"inventory"|"participant",entry?:string)=>kind==="participant"?`participant:${id(entry)}`:kind;
export function known(error:unknown,otherwise:SharedRoomRecoveryCatalogError["code"]="catalog_storage"):SharedRoomRecoveryCatalogError{if(error instanceof SharedRoomRecoveryCatalogError)return error;try{if(error&&typeof error==="object"&&"code" in error&&["recovery_in_use","writer_in_use","review_writer_in_use"].includes(String(error.code)))return failure("catalog_in_use");}catch{/* Never leak a foreign error getter or host payload. */}return failure(otherwise);}
