/** Detach every plain policy value before the first authority/factory call.
 * Executable functions and explicitly typed opaque signal/transport handles
 * retain identity. Getters, cycles, sparse arrays and hidden fields are not
 * executable policy inputs. A saved intent never contains any of this tree. */
import {operationV3Rows} from './input_snapshot.js';
import {physicalOperationV3Failure as fail} from './policy.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {selectedLocalOperationDriver} from '../independent_history/local_driver.js';
import {independentBootstrapPolicy,independentBootstrapSignal} from '../independent_history/bootstrap_policy.js';
import {independentLocalHistoryCapturePolicy} from '../independent_local_operation/source_policy.js';
export function snapshotPhysicalOperationV3Policy<T>(input:T):T{
 const active=new Set<object>();let nodes=0;
 const visit=(value:unknown,key:string,depth:number):unknown=>{
  if(++nodes>65536||depth>64)throw fail('physical_operation_v3_budget');
  if(value===null||value===undefined||typeof value==='string'||typeof value==='boolean'||typeof value==='function')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw fail('physical_operation_v3_policy');return value;}
  if(typeof value!=='object')throw fail('physical_operation_v3_policy');
  // Inspect the actual selected object BEFORE copying. Cloning its enumerable
  // fields must not erase a runtime-only driver, origin or bootstrap grant and
  // accidentally admit that object as a fresh ordinary host factory.
  if(independentDeliveryCompanion(value)||selectedLocalOperationDriver(value)||independentBootstrapPolicy(value)||independentBootstrapSignal(value)||independentLocalHistoryCapturePolicy(value))throw fail('physical_operation_v3_policy');
  // These contracts deliberately retain an actual host handle, not a DTO.
  if(key==='signal'||key==='transport')return value;
  if(active.has(value))throw fail('physical_operation_v3_policy');active.add(value);
  try{
   if(Array.isArray(value))return Object.freeze(operationV3Rows(value,item=>visit(item,'',depth+1)));
   const prototype=Object.getPrototypeOf(value);if(prototype!==null&&prototype!==Object.prototype)throw fail('physical_operation_v3_policy');
   const copy:Record<string,unknown>={};for(const field of Reflect.ownKeys(value)){
    if(typeof field!=='string'||field==='__proto__')throw fail('physical_operation_v3_policy');
    const descriptor=Object.getOwnPropertyDescriptor(value,field);if(!descriptor||!descriptor.enumerable||!('value'in descriptor))throw fail('physical_operation_v3_policy');
    Object.defineProperty(copy,field,{value:visit(descriptor.value,field,depth+1),enumerable:true});
   }return Object.freeze(copy);
  }finally{active.delete(value);}
 };return visit(input,'',0) as T;
}
/** Exact outer policy fields, including explicit optional own data fields. */
export function physicalOperationV3PolicyFields(value:unknown,required:readonly string[],optional:readonly string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('physical_operation_v3_policy');const keys=Reflect.ownKeys(value),allowed=[...required,...optional];
 if(required.some(key=>!Object.hasOwn(value,key))||keys.some(key=>typeof key!=='string'||!allowed.includes(key)))throw fail('physical_operation_v3_policy');
 const result:Record<string,unknown>={};for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!descriptor?.enumerable||!('value'in descriptor))throw fail('physical_operation_v3_policy');Object.defineProperty(result,key,{value:descriptor.value,enumerable:true});}return result;
}
