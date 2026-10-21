/** Hash-component ceilings only. Individual file/storage readers impose their own limits. */
import {participantAuthority} from "../participant_backup/policy.js";
export const MAX_SHARED_ARCHIVE_DIGEST_BYTES=1024*1024*1024;
export const MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES=1024*1024;
export class SharedArchiveIntegrityError extends Error {
 constructor(readonly code:"archive_policy"|"archive_budget"|"archive_integrity"|"archive_closed"|"archive_aborted"|"archive_authority"|"archive_capability"|"archive_io",message:string){super(message);this.name="SharedArchiveIntegrityError";}
}
export function archiveFailure(code:SharedArchiveIntegrityError["code"]="archive_integrity"):SharedArchiveIntegrityError{return new SharedArchiveIntegrityError(code,{
 archive_policy:"Select a complete closed archive family and independently retained identity",
 archive_budget:"Archive bytes exceed the explicitly selected family bounds",
 archive_integrity:"Complete archive bytes differ from the independently selected identity",
 archive_closed:"The archive is disposed or was not admitted by this SDK",
 archive_aborted:"Archive integrity work was cancelled",
 archive_authority:"The synchronous host archive authority did not hold",
 archive_capability:"Use the matching bounded native archive digest capability",
 archive_io:"The complete selected archive bytes could not be read"
}[code]);}
export function archiveGuard(check:()=>void,signal?:AbortSignal):()=>void {
 let authority:()=>void;try{authority=participantAuthority(check);}catch{throw archiveFailure("archive_authority");}
 return()=>{if(signal?.aborted)throw archiveFailure("archive_aborted");try{authority();}catch{throw archiveFailure("archive_authority");}if(signal?.aborted)throw archiveFailure("archive_aborted");};
}
/** Read actual native length, never an overridable public subclass size. No byte read occurs. */
export function archiveBlob(input:Blob,maximum:number):Blob {
 let size:unknown;try{if(typeof Blob!=="function"||!(input instanceof Blob))throw archiveFailure();size=Object.getOwnPropertyDescriptor(Blob.prototype,"size")?.get?.call(input);}catch{throw archiveFailure("archive_policy");}
 if(typeof size!=="number"||!Number.isSafeInteger(size)||size<0||size>maximum)throw archiveFailure("archive_budget");
 try{const file=new Blob([input],{type:input.type});if(file.size!==size)throw archiveFailure();return file;}catch{throw archiveFailure("archive_integrity");}
}
export function archiveFields(value:unknown,fields:string):Record<string,unknown>{const names=fields.split(",");if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))throw archiveFailure("archive_policy");return value as Record<string,unknown>;}
export function archiveInteger(value:unknown,minimum:number,maximum:number):number{if(typeof value!=="number"||!Number.isSafeInteger(value)||value<minimum||value>maximum)throw archiveFailure("archive_budget");return value;}
export const archiveHex=(value:readonly number[]):string=>value.map(byte=>byte.toString(16).padStart(2,"0")).join("");
