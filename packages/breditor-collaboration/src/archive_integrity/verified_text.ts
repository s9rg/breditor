/** Decode only the owned bytes that matched the selected entry pin. */
import type {ArchiveIntegrityContext} from './context.js';

export async function readVerifiedArchiveText(
 file:Blob,
 pin:Readonly<{bytes:number;sha256:string}>,
 maximumBytes:number,
 context:ArchiveIntegrityContext,
 invalid:()=>Error,
):Promise<string>{
 if(file.size!==pin.bytes)throw invalid();
 const {bytes,sha256}=await context.readAndDigest(file,maximumBytes);
 if(bytes.byteLength!==pin.bytes||sha256!==pin.sha256)throw invalid();
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
 catch{throw invalid();}
}
