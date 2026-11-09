/** A framing probe only bounds allocation. The header used by a caller comes
 * from the same byte stream that matched the selected whole-file digest. */
import type {ArchiveIntegrityContext} from './context.js';

interface VerifiedHeaderFormat {
 readonly magic:string;
 readonly maximumHeaderBytes:number;
 readonly invalid:()=>Error;
 readonly diverged:()=>Error;
 readonly budget:()=>Error;
}

export async function readVerifiedArchiveHeader(
 file:Blob,
 expectedSha256:string,
 context:ArchiveIntegrityContext,
 format:VerifiedHeaderFormat,
):Promise<{text:string;offset:number}>{
 const magic=new TextEncoder().encode(format.magic);
 const prefixBytes=magic.length+4;
 const length=(prefix:Uint8Array)=>{
  for(const [index,value] of magic.entries()){
   if(prefix[index]!==value)throw format.invalid();
  }
  const count=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(magic.length,true);
  if(count<2||count>format.maximumHeaderBytes||prefixBytes+count>file.size)throw format.budget();
  return count;
 };
 if(file.size<prefixBytes)throw format.invalid();
 const count=length(await context.read(file,0,prefixBytes));
 const offset=prefixBytes+count;
 const {bytes,sha256}=await context.readPrefixAndDigest(file,offset);
 if(sha256!==expectedSha256||bytes.byteLength!==offset)throw format.diverged();
 if(length(bytes.subarray(0,prefixBytes))!==count)throw format.diverged();
 try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(prefixBytes)),offset};}
 catch{throw format.invalid();}
}
