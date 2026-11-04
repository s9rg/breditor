/** Copy only finite read-length DATA through a deliberate error-family boundary.
 * No original error, message, stack, cause, payload, token or Blob is retained.
 * Observations never establish archive validity, ownership or a completed write.
 */
const descriptor=Object.getOwnPropertyDescriptor,define=Object.defineProperty,freeze=Object.freeze;
function own(input:unknown,key:string):unknown{
 if(input===null||typeof input!=='object'&&typeof input!=='function')return undefined;
 const row=descriptor(input,key);return row&&'value'in row?row.value:undefined;
}
/** Best effort only: inaccessible/malformed observations and frozen outcomes
 * cannot replace the original mapped error or invoke application accessors. */
export function preserveReadObservations<T extends Error>(outcome:T,reported:unknown):T{
 for(const[property,kind,keys]of[
  ['readFailure','read-length',['offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes']],
  ['payloadReadFailure','lineage-payload-read-length',['fileBytes','offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes']],
 ] as const)try{
  const row=own(reported,property);if(own(row,'kind')!==kind)continue;
  const numbers:Record<string,number>={};let valid=true;
  for(const key of keys){const value=own(row,key);if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0){valid=false;break;}numbers[key]=value;}
  if(valid)define(outcome,property,{value:freeze({kind,...numbers}),enumerable:true,writable:false,configurable:false});
 }catch{/* The selected refusal always survives diagnostic failure. */}
 return outcome;
}
