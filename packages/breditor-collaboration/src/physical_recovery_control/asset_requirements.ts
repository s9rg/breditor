/** New UTF-8 ordered request; no normalization of native identities or invented upload generations. */
import {archiveFields} from '../archive_integrity/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {controlFailure as fail} from './policy.js';
import {MAX_PHYSICAL_RECOVERY_ASSET_BYTES as maximum,MAX_PHYSICAL_RECOVERY_ASSET_REQUIREMENTS as count,type SharedPhysicalRecoveryAssetRequirements,type SharedPhysicalRecoveryAssetReference} from './asset_contract.js';
import type {SharedPhysicalRecoveryControlSelection} from './contract.js';
const encoder=new TextEncoder();
export function assetRequirementText(value:unknown):string{if(typeof value!=='string'||!value||encoder.encode(value).length>1024||new TextDecoder('utf-8',{fatal:true}).decode(encoder.encode(value))!==value)throw fail('control_policy');return value;}
export function physicalAssetContent(value:unknown):string{if(typeof value!=='string'||!/^sha256:[a-f0-9]{64}$/.test(value))throw fail('control_protocol');return value;}
export function physicalAssetReference(value:unknown):SharedPhysicalRecoveryAssetReference{const row=archiveFields(value,'asset,generation');return{asset:assetRequirementText(row['asset']),generation:assetRequirementText(row['generation'])};}
/** Rust String ordering is exact UTF-8 byte ordering, not JavaScript UTF-16 ordering. */
export function compareAssetText(a:string,b:string):number{let i=0,j=0;while(i<a.length&&j<b.length){const x=a.codePointAt(i)!,y=b.codePointAt(j)!;if(x!==y)return x-y;i+=x>65535?2:1;j+=y>65535?2:1;}return(a.length-i)-(b.length-j);}
export const assetReferenceKey=(r:SharedPhysicalRecoveryAssetReference)=>JSON.stringify([r.asset,r.generation]);
export const compareAssetReference=(a:SharedPhysicalRecoveryAssetReference,b:SharedPhysicalRecoveryAssetReference)=>compareAssetText(a.asset,b.asset)||compareAssetText(a.generation,b.generation);
export function physicalAssetRequirements(input:unknown):SharedPhysicalRecoveryAssetRequirements{
 try{
  const row=archiveFields(input,'references,uploads'),raw=row['references'],uploads=row['uploads'];
  if(!Array.isArray(raw)||!Array.isArray(uploads))throw fail('control_policy');const referenceCount=raw.length,uploadCount=uploads.length;if(!Number.isSafeInteger(referenceCount)||!Number.isSafeInteger(uploadCount)||referenceCount<0||uploadCount<0||referenceCount+uploadCount>count)throw fail('control_policy');
  const references:SharedPhysicalRecoveryAssetReference[]=[],content:string[]=[],keys=new Set<string>();
  for(let i=0;i<referenceCount;i++){if(!Object.hasOwn(raw,i))throw fail('control_policy');const r=physicalAssetReference(raw[i]),key=assetReferenceKey(r);if(keys.has(key))throw fail('control_policy');keys.add(key);references.push(r);}
  keys.clear();for(let i=0;i<uploadCount;i++){if(!Object.hasOwn(uploads,i))throw fail('control_policy');const key=physicalAssetContent(uploads[i]);if(keys.has(key))throw fail('control_policy');keys.add(key);content.push(key);}
  references.sort(compareAssetReference);content.sort(compareAssetText);return frozen({references,uploads:content});
 }catch{throw fail('control_policy');}
}
export async function preparePhysicalAssetRequest(selection:SharedPhysicalRecoveryControlSelection,input:unknown){
 const requirements=physicalAssetRequirements(input),body=JSON.stringify({format:'breditor/physical-room-recovery-asset-requirements',formatVersion:1,selection,references:requirements.references,uploads:requirements.uploads}),bytes=encoder.encode(body);if(bytes.length>maximum)throw fail('control_policy');
 if(!globalThis.crypto?.subtle?.digest)throw fail('control_policy');const digest=await crypto.subtle.digest('SHA-256',bytes),sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');return{body,sha256,requirements};
}
export function physicalAssetEndpoint(endpoint:string):string{const url=new URL(endpoint);url.pathname=url.pathname.replace(/\/check$/,'/assets/check');return url.href;}
