/** A bounded manifest followed by exact contiguous immutable entry bytes.
 * Whole-file and per-entry hashes are checked; no gaps, aliases or tail bytes. */
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {readVerifiedArchiveHeader} from '../archive_integrity/verified_header.js';
import {MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES} from '../archive_integrity/policy.js';
import {fail,integer,MAX_ROOM_RECORD_CUT_HEADER_BYTES,MAX_ROOM_RECORD_CUT_JSON_BYTES} from './policy.js';
export const ROOM_RECORD_CUT_MAGIC='BREDITOR-ROOM-RECORDS1\n';
export const ROOM_RECORD_CUT_PREFIX_BYTES=ROOM_RECORD_CUT_MAGIC.length+4;
export const ROOM_RECORD_CUT_MIME='application/vnd.breditor.room-record-cut';
export function recordCutPrefix(bytes:number):Uint8Array<ArrayBuffer>{integer(bytes,MAX_ROOM_RECORD_CUT_HEADER_BYTES,2);const value=new Uint8Array(ROOM_RECORD_CUT_PREFIX_BYTES);value.set(new TextEncoder().encode(ROOM_RECORD_CUT_MAGIC));new DataView(value.buffer).setUint32(ROOM_RECORD_CUT_MAGIC.length,bytes,true);return value;}
export async function recordCutBytes(file:Blob,offset:number,length:number,context:ArchiveIntegrityContext):Promise<Uint8Array<ArrayBuffer>>{
 integer(offset,file.size);integer(length,MAX_ROOM_RECORD_CUT_JSON_BYTES);if(offset+length>file.size)throw fail('record_cut_budget');const result=new Uint8Array(length);for(let n=0;n<length;n+=MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES){const bytes=await context.read(file,offset+n,Math.min(MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES,length-n));result.set(bytes,n);}return result;
}
function headerLength(prefix:Uint8Array,size:number):number{
 for(const [i,byte] of new TextEncoder().encode(ROOM_RECORD_CUT_MAGIC).entries()){
  if(prefix[i]!==byte)throw fail();
 }
 const count=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(ROOM_RECORD_CUT_MAGIC.length,true);
 if(count<2||count>MAX_ROOM_RECORD_CUT_HEADER_BYTES||ROOM_RECORD_CUT_PREFIX_BYTES+count>size)throw fail('record_cut_budget');
 return count;
}
function decodeHeader(raw:Uint8Array,offset:number):{text:string;offset:number}{
 try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(raw),offset};}catch{throw fail();}
}
async function probeHeaderLength(file:Blob,context:ArchiveIntegrityContext):Promise<number>{
 if(file.size<ROOM_RECORD_CUT_PREFIX_BYTES)throw fail();
 return headerLength(await context.read(file,0,ROOM_RECORD_CUT_PREFIX_BYTES),file.size);
}
export async function recordCutHeader(file:Blob,context:ArchiveIntegrityContext):Promise<{text:string;offset:number}>{
 const count=await probeHeaderLength(file,context);
 return decodeHeader(await recordCutBytes(file,ROOM_RECORD_CUT_PREFIX_BYTES,count,context),ROOM_RECORD_CUT_PREFIX_BYTES+count);
}
/** The small probe only selects a bounded byte count. Parse the actual header
 * from the same byte stream that matched the independently retained digest. */
export function readVerifiedRecordCutHeader(file:Blob,expectedSha256:string,context:ArchiveIntegrityContext):Promise<{text:string;offset:number}>{
 return readVerifiedArchiveHeader(file,expectedSha256,context,{
  magic:ROOM_RECORD_CUT_MAGIC,maximumHeaderBytes:MAX_ROOM_RECORD_CUT_HEADER_BYTES,
  invalid:()=>fail(),diverged:()=>fail('record_cut_integrity'),budget:()=>fail('record_cut_budget'),
 });
}
