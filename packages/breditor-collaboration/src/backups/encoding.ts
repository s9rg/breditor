import {SharedEditorError} from "../core.js";
/** Bounded, lossless UTF-8. A digest is corruption evidence, not authentication or encryption. */
export function backupUtf8(value:unknown,max:number):Uint8Array<ArrayBuffer>{
 if(typeof value!=="string"||value.length>max)throw new SharedEditorError("backup_budget","Backup data exceeds its explicit byte budget");
 const bytes=new TextEncoder().encode(value);
 if(bytes.byteLength>max)throw new SharedEditorError("backup_budget","Backup data exceeds its explicit byte budget");
 if(new TextDecoder("utf-8",{fatal:true}).decode(bytes)!==value)throw new SharedEditorError("backup_encoding","Backup data must be well-formed Unicode without replacement");
 return bytes;
}
export function backupJson(value:string,max:number):unknown{backupUtf8(value,max);try{return JSON.parse(value) as unknown;}catch{throw new SharedEditorError("backup_format","Backup JSON is invalid");}}
export async function backupDigest(payload:string,max:number):Promise<string>{
 const bytes=backupUtf8(payload,max);if(!globalThis.crypto?.subtle)throw new SharedEditorError("backup_crypto_unavailable","Backup integrity requires Web Crypto SHA-256");
 const digest=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
