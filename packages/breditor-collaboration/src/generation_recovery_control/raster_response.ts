/** Closed canonical envelope, bounded canonical base64 and actual byte hashing.
 * Raster decoding remains the consuming capture's existing admission step. */
import {archiveFields as fields} from '../archive_integrity/policy.js';
import {generationControlSelection} from './identity.js';
import {recoveryAssetInfo} from './asset_response.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
import type {SharedServerLogGenerationRecoveryRasterRead} from './raster_contract.js';
import {MAX_SERVER_GENERATION_RECOVERY_RASTER_BYTES as maximum} from './raster_contract.js';
import {controlFailure as fail} from './policy.js';
const readBlob=Blob.prototype.arrayBuffer;
export function readRecoveryRasterResponse(text:string,expected:SharedServerLogGenerationRecoveryControlSelection,sha256:string,asset:string):SharedServerLogGenerationRecoveryRasterRead{
 try{
  const r=fields(JSON.parse(text),'format,formatVersion,selection,requestSha256,scope,raster');
  if(r['format']!=='breditor/server-log-generation-recovery-raster-read'||r['formatVersion']!==1||r['requestSha256']!==sha256||r['scope']!=='selected-server-stored-raster-bytes')throw fail();
  const selection=generationControlSelection(r['selection']);if(JSON.stringify(selection)!==JSON.stringify(expected))throw fail();
  let wire:null|{info:ReturnType<typeof recoveryAssetInfo>;base64:string}=null,raster:SharedServerLogGenerationRecoveryRasterRead['raster']=null;
  if(r['raster']!==null){
   const row=fields(r['raster'],'info,base64'),info=Object.freeze(recoveryAssetInfo(row['info'])),encoded=row['base64'];
   if(info.asset!==asset||info.bytes>maximum||selection.source.server.assets.assets<1||info.bytes>selection.source.server.assets.bytes||typeof encoded!=='string'||encoded.length!==4*Math.ceil(info.bytes/3))throw fail();
   const decoded=atob(encoded);if(decoded.length!==info.bytes||btoa(decoded)!==encoded)throw fail();
   const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));wire={info,base64:encoded};raster=Object.freeze({info,blob:Object.freeze(new Blob([bytes],{type:info.mime}))});
  }
  const header={format:'breditor/server-log-generation-recovery-raster-read' as const,formatVersion:1 as const,selection,requestSha256:sha256,scope:'selected-server-stored-raster-bytes' as const};
  if(JSON.stringify({...header,raster:wire})!==text)throw fail();return Object.freeze({...header,raster});
 }catch{throw fail('control_protocol');}
}
export async function verifyRecoveryRasterBytes(read:SharedServerLogGenerationRecoveryRasterRead):Promise<void>{
 try{if(read.raster){const bytes=await readBlob.call(read.raster.blob);if(bytes.byteLength!==read.raster.info.bytes)throw fail();const digest=await crypto.subtle.digest('SHA-256',bytes),asset='sha256:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(asset!==read.raster.info.asset)throw fail();}}catch{throw fail('control_protocol');}
}
