
/** The caller supplies no Native result, packet filter or source substitute. */
import type {ServerMetadataFamily} from '../server_metadata_read/contract.js';
import {fail} from './policy.js';
export async function prepareNativeDependencyRequest<S>(family:ServerMetadataFamily,selection:S){
 const body=JSON.stringify({format:'breditor/'+family+'-native-dependencies-request',formatVersion:1,selection}),bytes=new TextEncoder().encode(body);if(bytes.length>64*1024||!globalThis.crypto?.subtle?.digest)throw fail('native_dependencies_policy');
 const digest=await crypto.subtle.digest('SHA-256',bytes);return{body,sha256:[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
}
export function nativeDependencyEndpoint(endpoint:string):string{const url=new URL(endpoint);if(!url.pathname.endsWith('/check'))throw fail('native_dependencies_policy');url.pathname=url.pathname.slice(0,-6)+'/native-dependencies/read';return url.href;}
