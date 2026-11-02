/** One exact content ID under the caller's independently selected current control. */
import {generationAssetContent} from './asset_requirements.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
import {MAX_SERVER_GENERATION_RECOVERY_RASTER_REQUEST_BYTES as maximum} from './raster_contract.js';
import {controlFailure as fail} from './policy.js';
export function recoveryRasterAsset(value:unknown):string{try{return generationAssetContent(value);}catch{throw fail('control_policy');}}
export async function prepareRecoveryRasterRequest(selection:SharedServerLogGenerationRecoveryControlSelection,asset:string){
 const body=JSON.stringify({format:'breditor/server-log-generation-recovery-raster-request',formatVersion:1,selection,asset:recoveryRasterAsset(asset)}),bytes=new TextEncoder().encode(body);
 if(bytes.byteLength>maximum||!globalThis.crypto?.subtle?.digest)throw fail('control_policy');
 const digest=await crypto.subtle.digest('SHA-256',bytes),sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');return{body,sha256};
}
export function recoveryRasterEndpoint(endpoint:string):string{const url=new URL(endpoint);url.pathname=url.pathname.replace(/\/check$/,'/assets/bytes/read');return url.href;}
