/** Detach bounded inert declarations without invoking accessors or toJSON. */
import {fields} from '../physical_room_record_cut/policy.js';
import {publicationFailure as fail,MAX_SHARED_NATIVE_PUBLICATION_CONTROL_BYTES as maximum} from './policy.js';
export function publicationData(value:unknown):unknown {
 const active=new WeakSet<object>();let nodes=0,bytes=0;
 function copy(value:unknown,depth:number):unknown {
  if(++nodes>maximum||depth>96)throw fail('publication_policy');
  if(value===null||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw fail('publication_policy');return value;}
  if(typeof value==='string'){bytes+=new TextEncoder().encode(value).length;if(bytes>maximum)throw fail('publication_policy');return value;}
  if(!value||typeof value!=='object'||active.has(value))throw fail('publication_policy');
  active.add(value);try{
   if(Array.isArray(value)){const length=Object.getOwnPropertyDescriptor(value,'length');if(!length||!('value'in length)||!Number.isSafeInteger(length.value)||length.value<0||length.value>maximum||Reflect.ownKeys(value).length!==length.value+1)throw fail('publication_policy');const out=[];for(let i=0;i<length.value;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!('value'in d))throw fail('publication_policy');out.push(copy(d.value,depth+1));}return out;}
   const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw fail('publication_policy');
   const names=Reflect.ownKeys(value);if(names.some(name=>typeof name!=='string'))throw fail('publication_policy');const data=fields(value,names as string[]),out:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
   for(const name of names as string[]){bytes+=new TextEncoder().encode(name).length;if(bytes>maximum)throw fail('publication_policy');Object.defineProperty(out,name,{value:copy(data[name],depth+1),enumerable:true});}return out;
  }finally{active.delete(value);}
 }
 return copy(value,0);
}
