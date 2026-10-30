/** Separate opt-in packet action; original metadata page protocol is unchanged. */
import type {ServerMetadataFamily} from './contract.js';
import type {OriginalMetadataPacketQuery} from './packet_contract.js';
import {fail} from './policy.js';
export async function prepareMetadataPacketRequest<S>(family:ServerMetadataFamily,selection:S,packet:OriginalMetadataPacketQuery){
 const body=JSON.stringify({format:`breditor/${family}-metadata-packet-request`,formatVersion:1,selection,packet}),bytes=new TextEncoder().encode(body);
 if(bytes.length>64*1024||!globalThis.crypto?.subtle?.digest)throw fail('metadata_read_policy');
 const digest=await crypto.subtle.digest('SHA-256',bytes),sha256=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 return{body,sha256};
}
export function metadataPacketEndpoint(endpoint:string):string{const url=new URL(endpoint);if(!url.pathname.endsWith('/check'))throw fail('metadata_read_policy');url.pathname=url.pathname.replace(/\/check$/,'/metadata/packet/read');return url.href;}
