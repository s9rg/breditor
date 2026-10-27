/** Closed DATA-only snapshot under actual native exclusion; accessors never run. */
import{nativeRecoveryFailure as fail}from'./policy.js';
const MAX_BYTES=4*1024*1024,MAX_WINDOWS=4096,MAX_COUNTER=18446744073709551615n;
function fields(value:unknown,names:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail();const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);if(keys.length!==names.length||keys.some(key=>typeof key!=='string'||!names.includes(key)))throw fail();const out:Record<string,unknown>={};for(const key of names){const descriptor=descriptors[key];if(!descriptor||!('value'in descriptor))throw fail();out[key]=descriptor.value;}return out;
}
function counter(value:unknown):string{if(typeof value!=='string'||!/^[1-9][0-9]{0,19}$/.test(value)||BigInt(value)>MAX_COUNTER)throw fail();return value;}
export function nativeBranchAuthorizations(provided:unknown):string{
 if(!Array.isArray(provided))throw fail();const descriptors=Object.getOwnPropertyDescriptors(provided) as unknown as Record<string,PropertyDescriptor>,length=descriptors['length'];if(!length||!('value'in length)||typeof length.value!=='number'||!Number.isSafeInteger(length.value)||length.value<0||length.value>MAX_WINDOWS)throw fail();const size=length.value as number;if(Reflect.ownKeys(descriptors).length!==size+1)throw fail();const authorizations=[];
 for(let i=0;i<size;i++){
  const descriptor=descriptors[String(i)];if(!descriptor||!('value'in descriptor))throw fail();const row=fields(descriptor.value,['source','from','through','prefixDigest']),source=fields(row['source'],['actor','principal','access']),actor=source['actor'],principal=source['principal'],access=source['access'],from=counter(row['from']),through=counter(row['through']),prefixDigest=row['prefixDigest'];
  if(typeof actor!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(actor)||typeof principal!=='string'||!principal.trim()||new TextEncoder().encode(principal).length>256||[...principal].some(char=>{const code=char.codePointAt(0)!;return code<32||code>=127&&code<=159;})||access!=='read_only'&&access!=='comment'&&access!=='moderate'||BigInt(from)>BigInt(through)||typeof prefixDigest!=='string'||!/^sha256:[0-9a-f]{64}$/.test(prefixDigest))throw fail();
  authorizations.push({source:{actor,principal,access},from,through,prefixDigest});
 }
 const json=JSON.stringify({format:'breditor/native-branch-union-authorizations',formatVersion:1,authorizations});if(new TextEncoder().encode(json).length>MAX_BYTES)throw fail();return json;
}
