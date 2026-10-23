/** Closed durable intent data, not executable API hooks. Own data descriptors
 * avoid getters; explicit indexes ignore map/species/iterator replacements and
 * refuse sparse or inherited array entries before an intent can be persisted. */
import {physicalOperationV3Failure as fail} from './policy.js';
export function operationV3Fields(value:unknown,fields:string):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('physical_operation_v3_diverged');
 const names=fields.split(','),keys=Reflect.ownKeys(value);if(keys.length!==names.length||keys.some(key=>typeof key!=='string'||!names.includes(key)))throw fail('physical_operation_v3_diverged');
 const result=Object.create(null) as Record<string,unknown>;for(const name of names){const descriptor=Object.getOwnPropertyDescriptor(value,name);if(!descriptor||!descriptor.enumerable||!('value'in descriptor))throw fail('physical_operation_v3_diverged');result[name]=descriptor.value;}return result;
}
export function operationV3Rows<T,R>(value:readonly T[],read:(row:T)=>R):R[]{
 if(!Array.isArray(value))throw fail('physical_operation_v3_diverged');const size=Object.getOwnPropertyDescriptor(value,'length')?.value;if(!Number.isSafeInteger(size)||size<0||size>1024)throw fail('physical_operation_v3_diverged');
 const rows:R[]=[];for(let index=0;index<size;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor||!descriptor.enumerable||!('value'in descriptor)||descriptor.value===undefined||descriptor.value===null)throw fail('physical_operation_v3_diverged');rows.push(read(descriptor.value as T));}return rows;
}
