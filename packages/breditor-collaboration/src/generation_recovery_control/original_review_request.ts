/** Detach the complete closed request before host callbacks or an asynchronous read. */
import {controlFailure as fail} from './policy.js';
import {reviewBinding,reviewSource} from '../relay/review_validation.js';
import {decimal} from '../relay/validation.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
import type {GenerationOriginalReviewRange,GenerationOriginalReviewQuery} from './original_review_contract.js';
export function generationOriginalReviewFields(value:unknown,keys:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('control_policy');
 const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors),allowed=[...keys,...optional],out:Record<string,unknown>={};
 if(names.some(name=>typeof name!=='string'||!allowed.includes(name))||keys.some(name=>!Object.hasOwn(descriptors,name)))throw fail('control_policy');
 for(const name of names){const field=descriptors[name as string]!;if(!('value'in field))throw fail('control_policy');out[name as string]=field.value;}return out;
}
export function generationOriginalReviewRows(value:unknown,max:number):readonly unknown[]{
 if(!Array.isArray(value))throw fail('control_policy');const fields=Object.getOwnPropertyDescriptors(value) as unknown as Record<string,PropertyDescriptor>,length=fields['length'];
 if(!length||!('value'in length)||typeof length.value!=='number'||!Number.isSafeInteger(length.value)||length.value<0||length.value>max||Reflect.ownKeys(fields).length!==length.value+1)throw fail('control_policy');
 const out:unknown[]=[];for(let i=0;i<length.value;i++){const field=fields[String(i)];if(!field||!('value'in field))throw fail('control_policy');out.push(field.value);}return out;
}
export function generationOriginalReviewRange(value:unknown):GenerationOriginalReviewRange{
 const r=generationOriginalReviewFields(value,['actor','principal','from','through']),policy=reviewSource({actor:r['actor'],principal:r['principal'],role:'comment'}),from=decimal(r['from']),through=decimal(r['through']);
 if(from==='0'||BigInt(from)>BigInt(through))throw fail('control_policy');return{actor:policy.actor,principal:policy.principal,from,through};
}
export function generationOriginalReviewChoices(value:unknown):GenerationOriginalReviewQuery{
 try{const r=generationOriginalReviewFields(value,['binding','ranges']),binding=reviewBinding(r['binding']),ranges=generationOriginalReviewRows(r['ranges'],1024).map(generationOriginalReviewRange);let previous:GenerationOriginalReviewRange|undefined;
  for(const range of ranges){if(previous&&(range.actor<previous.actor||range.actor===previous.actor&&BigInt(range.from)<=BigInt(previous.through)))throw fail('control_policy');previous=range;}
  if(new TextEncoder().encode(JSON.stringify(ranges)).length>64*1024)throw fail('control_policy');return frozen({binding,ranges});
 }catch{throw fail('control_policy');}
}
export async function prepareGenerationOriginalReviewRequest(selection:SharedServerLogGenerationRecoveryControlSelection,query:GenerationOriginalReviewQuery){
 const body=JSON.stringify({format:'breditor/server-log-generation-review-original-authorizations-request',formatVersion:1,selection,binding:query.binding,ranges:query.ranges}),bytes=new TextEncoder().encode(body);
 if(bytes.length>64*1024||!globalThis.crypto?.subtle?.digest)throw fail('control_policy');const hash=await crypto.subtle.digest('SHA-256',bytes);return{body,sha256:[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
}
export function generationOriginalReviewEndpoint(endpoint:string):string{const url=new URL(endpoint);url.pathname=url.pathname.replace(/\/check$/,'/review/authorizations/read');return url.href;}
