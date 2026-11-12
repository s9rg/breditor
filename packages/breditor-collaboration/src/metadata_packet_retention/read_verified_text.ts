/** Decode packet data from the same bounded read that matched its digest. */
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {fail} from './policy.js';

export async function readVerifiedPacketText(file:Blob,expectedSha256:string,maximumBytes:number,integrity:ArchiveIntegrityContext):Promise<string>{
 const {bytes,sha256}=await integrity.readAndDigest(file,maximumBytes);
 if(sha256!==expectedSha256)throw fail();
 try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}
 catch{throw fail();}
}
