/** Exact literal comparison with bounded temporary buffers. Both files come
 * from genuine owners; no caller Blob methods or iterator select this proof. */
import {nativeInputIncomingFailure as fail} from './incoming_source_failure.js';
const size=Object.getOwnPropertyDescriptor(Blob.prototype,'size')?.get;
const type=Object.getOwnPropertyDescriptor(Blob.prototype,'type')?.get;
const slice=Blob.prototype.slice,arrayBuffer=Blob.prototype.arrayBuffer;
const CHUNK_BYTES=64*1024;

export async function verifyNativeInputIncomingLiteral(actual:Blob,expected:Blob,check:()=>void):Promise<void>{
 if(!size||!type)throw fail();
 const length=size.call(actual) as number;
 if(!Number.isSafeInteger(length)||length<1||length!==size.call(expected)||type.call(actual)!==type.call(expected))throw fail();
 check();
 for(let offset=0;offset<length;offset+=CHUNK_BYTES){
  const a=new Uint8Array(await arrayBuffer.call(slice.call(actual,offset,offset+CHUNK_BYTES)));check();
  const b=new Uint8Array(await arrayBuffer.call(slice.call(expected,offset,offset+CHUNK_BYTES)));check();
  if(a.length!==b.length)throw fail();for(let index=0;index<a.length;index++)if(a[index]!==b[index])throw fail();
 }
 check();
}
