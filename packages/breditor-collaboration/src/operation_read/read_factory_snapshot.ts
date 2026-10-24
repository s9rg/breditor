/** Copy read-factory configuration, never a source, signal or native owner.
 * Only data properties, plain records, bounded arrays and callable leaves are
 * admitted. Family policy then checks every actual field and identity. */
import {SharedEditorError} from '../core.js';
const fail=()=>new SharedEditorError('fresh_parent_read_policy','Supply bounded plain read-factory data properties without source/store selectors');
export function snapshotReadFactoryData<T>(input:T):T{
 let fields=0;const ancestors=new Set<object>();
 const copy=(value:unknown,depth:number):unknown=>{if(value===null||typeof value!=='object')return value;if(depth>32||ancestors.has(value))throw fail();ancestors.add(value);try{
  if(Array.isArray(value)){const length=Object.getOwnPropertyDescriptor(value,'length')?.value;if(!Number.isSafeInteger(length)||length<0||length>1024)throw fail();const output:unknown[]=[];for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value'in d)||++fields>4096)throw fail();output.push(copy(d.value,depth+1));}if(Object.keys(value).some(k=>!/^\d+$/.test(k)||Number(k)>=length))throw fail();return output;}
  const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)throw fail();const output:Record<string,unknown>={};for(const name of Object.keys(value)){const d=Object.getOwnPropertyDescriptor(value,name);if(!d||!('value'in d)||++fields>4096||name==='__proto__')throw fail();Object.defineProperty(output,name,{value:copy(d.value,depth+1),enumerable:true,writable:true,configurable:true});}return output;
 }finally{ancestors.delete(value);}};
 return copy(input,0) as T;
}
export function snapshotFreshFactoryOptions<T extends{session:unknown;limits?:unknown}>(provided:T):T{const value=snapshotReadFactoryData(provided);if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,'session')||Object.keys(value).some(name=>!['session','limits'].includes(name)))throw fail();return value;}
