/** Original mandatory three-lane request. No fields are inferred from an archive. */
import type {ServerMetadataFamily,OriginalMetadataQuery} from './contract.js';
import {fail} from './policy.js';
export async function prepareMetadataRequest<S>(family:ServerMetadataFamily,selection:S,metadata:OriginalMetadataQuery){
 const body=JSON.stringify({format:`breditor/${family}-metadata-request`,formatVersion:1,selection,metadata}),bytes=new TextEncoder().encode(body);if(bytes.length>64*1024||!globalThis.crypto?.subtle?.digest)throw fail('metadata_read_policy');
 const digest=await crypto.subtle.digest('SHA-256',bytes),sha256=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');return{body,sha256};
}
export function metadataEndpoint(endpoint:string):string{const url=new URL(endpoint);if(!url.pathname.endsWith('/check'))throw fail('metadata_read_policy');url.pathname=url.pathname.replace(/\/check$/,'/metadata/read');return url.href;}
