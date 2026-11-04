/** Bounded error-chain reporting for test assertions. Saved errors, causes and
 * observations are DATA; reporting never replaces, retries or accepts a read. */
const own=(value,key)=>{try{const row=Object.getOwnPropertyDescriptor(value,key);return row&&'value'in row?row.value:undefined;}catch{return undefined;}};
const nativeStackGetter=Object.getOwnPropertyDescriptor(new Error(),'stack')?.get;
const stackOf=value=>{try{const descriptor=Object.getOwnPropertyDescriptor(value,'stack');if(descriptor&&'value'in descriptor)return descriptor.value;if(nativeStackGetter&&descriptor?.get===nativeStackGetter)return Reflect.apply(nativeStackGetter,value,[]);}catch{}return undefined;};
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const integer=value=>Number.isSafeInteger(value)&&value>=0;
export function reportArchiveErrorChain(error,emit=console.error){
 const queued=[{error,path:'$'}],seen=new Set();let count=0;
 while(queued.length&&seen.size<8){const current=queued.shift(),value=current.error;if(!object(value)||seen.has(value))continue;seen.add(value);
  const code=own(value,'code'),record={path:current.path};let measured=false;
  for(const[property,kind,fields]of[['readFailure','read-length',['offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes']],['payloadReadFailure','lineage-payload-read-length',['fileBytes','offset','expectedBytes','observedBeforeAuthorityBytes','actualBytes']]]){
   const row=own(value,property);if(!object(row)||own(row,'kind')!==kind)continue;const numbers=Object.fromEntries(fields.map(key=>[key,own(row,key)]));if(!Object.values(numbers).every(integer))continue;record[property]={kind,...numbers};measured=true;
  }
  if(measured||typeof code==='string'&&/^(?:archive_|lineage_payload_)[a-z_]{1,64}$/.test(code)){
   if(typeof code==='string'&&/^[a-z_]{1,80}$/.test(code))record.code=code;
   const stack=stackOf(value);if(typeof stack==='string')record.frames=stack.split('\n').slice(1,9).join('\n').slice(0,3072);
   try{emit('ARCHIVE_ERROR_CHAIN '+JSON.stringify(record));count++;}catch{/* Preserve the actual workflow failure even if reporting fails. */}
  }
  for(const key of['actual','cause']){const child=own(value,key);if(object(child))queued.push({error:child,path:current.path+'.'+key});}
  const members=own(value,'errors'),length=object(members)?own(members,'length'):undefined;if(Array.isArray(members)&&integer(length))for(let i=0;i<Math.min(length,4);i++){const child=own(members,String(i));if(object(child))queued.push({error:child,path:current.path+'.errors['+i+']'});}
 }
 return count;
}
export async function withArchiveErrorChain(work,emit=console.error){try{return await work();}catch(error){try{reportArchiveErrorChain(error,emit);}catch{/* Keep the original exception, including custom/proxy errors. */}throw error;}}
