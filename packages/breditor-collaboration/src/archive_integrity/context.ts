import {archiveReadLengthFailure} from './read_length_failure.js';
/** Chunked Native hashing with explicit buffering limits for decoded bytes. */
import {archiveBlob,archiveFailure,archiveGuard,SharedArchiveIntegrityError,MAX_SHARED_ARCHIVE_DIGEST_BYTES,MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES} from "./policy.js";
import type {SharedArchiveIntegrityOptions,SharedArchiveDigestModule,SharedRustArchiveDigest} from "./contract.js";
interface DigestedArchiveBytes {
 readonly bytes:Uint8Array<ArrayBuffer>;
 readonly sha256:string;
}
export interface ArchiveIntegrityContext {
 readonly wasm:SharedArchiveDigestModule;
 readonly guard:()=>void;
 readonly read:(file:Blob,offset:number,bytes:number)=>Promise<Uint8Array<ArrayBuffer>>;
 readonly digest:(file:Blob)=>Promise<string>;
 /** A buffered read requires the caller to pass its archive family byte limit. */
 readonly readAndDigest:(file:Blob,maximumBytes:number)=>Promise<DigestedArchiveBytes>;
 /** Keep only the requested prefix while verifying the entire selected file. */
 readonly readPrefixAndDigest:(file:Blob,prefixBytes:number)=>Promise<DigestedArchiveBytes>;
}
export function prepareArchiveIntegrity(options:SharedArchiveIntegrityOptions):ArchiveIntegrityContext {
 const guard=archiveGuard(options.checkAuthority,options.signal);guard();
 let create:(bytes:string)=>SharedRustArchiveDigest;
 try{const factory=options.wasm.SharedArchiveDigest,version=factory.version,maximum=factory.maximum_bytes,chunk=factory.maximum_chunk_bytes,construct=factory.create;if(version.call(factory)!=="1"||maximum.call(factory)!==String(MAX_SHARED_ARCHIVE_DIGEST_BYTES)||chunk.call(factory)!==String(MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES)||typeof construct!=="function")throw archiveFailure();create=construct.bind(factory);}catch{throw archiveFailure("archive_capability");}
 const slice=Blob.prototype.slice,arrayBuffer=Blob.prototype.arrayBuffer;
 const read=async(file:Blob,offset:number,bytes:number):Promise<Uint8Array<ArrayBuffer>>=>{
  guard();if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(bytes)||bytes<0||bytes>MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES||offset+bytes>file.size)throw archiveFailure("archive_budget");
  let result:ArrayBuffer;try{result=await arrayBuffer.call(slice.call(file,offset,offset+bytes));}catch{guard();throw archiveFailure("archive_io");}const observedBeforeAuthorityBytes=result.byteLength;guard();const actualBytes=result.byteLength;if(actualBytes!==bytes)throw archiveReadLengthFailure(offset,bytes,observedBeforeAuthorityBytes,actualBytes);return new Uint8Array(result);
 };
 const digestFile=async(file:Blob,output?:Uint8Array<ArrayBuffer>):Promise<string>=>{
  let owner:SharedRustArchiveDigest|undefined,release:(()=>void)|undefined;
  try{
   owner=create(String(file.size));const free=owner.free,update=owner.update,finish=owner.finish;if(typeof free==="function")release=free.bind(owner);if(!release||typeof update!=="function"||typeof finish!=="function")throw archiveFailure("archive_capability");
   for(let offset=0;offset<file.size;offset+=MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES){
    const count=Math.min(MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES,file.size-offset);
    const input=await read(file,offset,count);
    let bytes=input;
    if(output&&offset<output.byteLength){
     const kept=Math.min(count,output.byteLength-offset);
     const target=output.subarray(offset,offset+kept);
     if(kept===count){
      target.set(input);
      bytes=target;
     }else{
      // Own the boundary chunk before authority or Native callbacks run.
      bytes=input.slice();
      target.set(bytes.subarray(0,kept));
     }
    }
    guard();
    if(update.call(owner,bytes)!==undefined)throw archiveFailure("archive_capability");
    guard();
   }
   guard();const result=finish.call(owner);guard();if(typeof result!=="string"||!/^[a-f0-9]{64}$/.test(result))throw archiveFailure("archive_integrity");return result;
  }catch(error){if(error instanceof SharedArchiveIntegrityError)throw error;throw archiveFailure("archive_integrity");}
  finally{if(release)try{release();}catch{throw archiveFailure("archive_integrity");}}
 };
 const digest=async(input:Blob):Promise<string>=>{
  guard();
  return digestFile(archiveBlob(input,MAX_SHARED_ARCHIVE_DIGEST_BYTES));
 };
 const readBuffered=async(file:Blob,count:number):Promise<DigestedArchiveBytes>=>{
  const bytes=new Uint8Array(count);
  const sha256=await digestFile(file,bytes);
  guard();
  return {bytes,sha256};
 };
 const readAndDigest=async(input:Blob,maximumBytes:number):Promise<DigestedArchiveBytes>=>{
  guard();
  if(!Number.isSafeInteger(maximumBytes)||maximumBytes<0||maximumBytes>MAX_SHARED_ARCHIVE_DIGEST_BYTES)throw archiveFailure("archive_budget");
  const file=archiveBlob(input,maximumBytes);
  return readBuffered(file,file.size);
 };
 const readPrefixAndDigest=async(input:Blob,prefixBytes:number):Promise<DigestedArchiveBytes>=>{
  guard();
  const file=archiveBlob(input,MAX_SHARED_ARCHIVE_DIGEST_BYTES);
  if(!Number.isSafeInteger(prefixBytes)||prefixBytes<0||prefixBytes>file.size)throw archiveFailure("archive_budget");
  return readBuffered(file,prefixBytes);
 };
 const wasm=Object.freeze({SharedArchiveDigest:Object.freeze({version:()=>"1",maximum_bytes:()=>String(MAX_SHARED_ARCHIVE_DIGEST_BYTES),maximum_chunk_bytes:()=>String(MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES),create})});
 return Object.freeze({wasm,guard,read,digest,readAndDigest,readPrefixAndDigest});
}
