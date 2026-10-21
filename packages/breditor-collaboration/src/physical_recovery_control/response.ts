/** Bounded complete strict UTF-8 operator response; rejected streams are cancelled and released. */
import {MAX_PHYSICAL_RECOVERY_CONTROL_BYTES,controlFailure as fail} from './policy.js';
export async function readPhysicalControlResponse(response:Response,maximum=MAX_PHYSICAL_RECOVERY_CONTROL_BYTES):Promise<string> {
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||length.length>20||BigInt(length)>BigInt(maximum))||response.headers.get('content-type')?.split(';',1)[0]!=='application/json'||!response.body){await response.body?.cancel().catch(()=>{});throw fail();}
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0,complete=false;
 try{
  while(true){const next=await reader.read();if(next.done){complete=true;break;}size+=next.value.byteLength;if(size>maximum)throw fail();chunks.push(next.value);}
  if(length!==null&&BigInt(size)!==BigInt(length))throw fail();
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
 }finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
