/** Snapshot JSON data without invoking accessors, coercion or toJSON hooks.
 * These are outer-envelope bounds; original nested record limits still apply. */
import {fail} from './error.js';
export const MAX_LOCAL_METADATA_BYTES=1024*1024*1024;
export const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function metadataData(input:unknown):unknown{
 let nodes=0;
 function copy(value:unknown,depth:number):unknown{
  if(++nodes>1048576||depth>32)throw fail('local_metadata_delivery_budget');
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))throw fail();return value;}
  if(!value||typeof value!=='object')throw fail();
  const keys=Reflect.ownKeys(value),array=Array.isArray(value),result:unknown[]|Record<string,unknown>=array?[]:{};
  if(array){const length=Object.getOwnPropertyDescriptor(value,'length');if(!length||!('value'in length)||keys.length!==length.value+1)throw fail();for(let i=0;i<length.value;i++)if(!Object.hasOwn(value,String(i)))throw fail();}
  else if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw fail();
  for(const key of keys){if(array&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!d?.enumerable||!('value'in d)||array&&!/^(?:0|[1-9][0-9]*)$/.test(key))throw fail();Object.defineProperty(result,key,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});}return result;
 }
 return copy(input,0);
}
export function metadataJson(input:unknown):string{const text=JSON.stringify(input);if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_LOCAL_METADATA_BYTES)throw fail('local_metadata_delivery_budget');return text;}
