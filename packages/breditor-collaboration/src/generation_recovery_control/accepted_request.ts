/** Detach closed data choices before any permission callback, hashing or I/O.
 * Continuation omits the document explicitly; it never skips a required page. */
import {archiveFields} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {reviewBinding} from '../relay/review_validation.js';
import {decimal} from '../relay/validation.js';
import {controlFailure as fail} from './policy.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
import type {SharedServerLogGenerationRecoveryAcceptedRequest} from './accepted_contract.js';
function data(input:unknown,keys:string){const r=archiveFields(input,keys),values:Record<string,unknown>={};for(const key of keys.split(',')){const field=Object.getOwnPropertyDescriptor(r,key);if(!field||!('value'in field))throw fail('control_policy');values[key]=field.value;}return values;}
export function generationAcceptedChoices(input:unknown):SharedServerLogGenerationRecoveryAcceptedRequest {
 try{const r=data(input,'document,review'),document=r['document'];if(document!=='include'&&document!=='omit')throw fail();const descriptor=Object.getOwnPropertyDescriptor(r['review']??{},'kind');if(!descriptor||!('value'in descriptor))throw fail();const kind=descriptor.value;if(kind==='absent'||kind==='start'){data(r['review'],'kind');return frozen({document,review:{kind}});}if(kind!=='after')throw fail();const review=data(r['review'],'kind,cursor'),cursor=data(review['cursor'],'binding,after');return frozen({document,review:{kind,cursor:{binding:reviewBinding(cursor['binding']),after:decimal(cursor['after'])}}});}catch{throw fail('control_policy');}
}
export async function prepareGenerationAcceptedRequest(selection:SharedServerLogGenerationRecoveryControlSelection,request:SharedServerLogGenerationRecoveryAcceptedRequest){
 const body=JSON.stringify({format:'breditor/server-log-generation-recovery-accepted-native-request',formatVersion:1,selection,document:request.document,review:request.review}),bytes=new TextEncoder().encode(body);if(bytes.length>64*1024||!globalThis.crypto?.subtle?.digest)throw fail('control_policy');const digest=await crypto.subtle.digest('SHA-256',bytes),sha256=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');return{body,sha256};
}
export function generationAcceptedEndpoint(endpoint:string):string{const url=new URL(endpoint);url.pathname=url.pathname.replace(/\/check$/,'/accepted/read');return url.href;}
