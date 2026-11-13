/** Detach every plain policy value before the first authority/factory call.
 * Executable functions and explicitly typed opaque signal/transport handles
 * retain identity. A continued generation factory keeps its two native restore
 * methods bound to the original receiver. Getters, cycles, sparse arrays and hidden fields are not
 * executable policy inputs. A saved intent never contains any of this tree. */
import {operationV3Rows} from './input_snapshot.js';
import {physicalOperationV3Failure as fail} from './policy.js';
import {independentDeliveryCompanion} from '../independent_history/driver.js';
import {selectedLocalOperationDriver} from '../independent_history/local_driver.js';
import {independentBootstrapPolicy,independentBootstrapSignal} from '../independent_history/bootstrap_policy.js';
import {independentLocalHistoryCapturePolicy} from '../independent_local_operation/source_policy.js';
const escapePath=(key:string)=>key.replaceAll('~','~0').replaceAll('/','~1').replaceAll('*','~2');
const own=(value:unknown,key:string):unknown=>value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
function continuedProfile(value:object){
 const restore=(name:'restore_segmented'|'restore_continued_history')=>{
  let receiver:object|null=value;
  for(let depth=0;receiver&&depth<16;depth++,receiver=Object.getPrototypeOf(receiver)){
   const descriptor=Object.getOwnPropertyDescriptor(receiver,name);
   if(!descriptor)continue;
   const method=descriptor.value;
   if(typeof method!=='function')break;
   return (room:string,checkpoint:string)=>Reflect.apply(method,value,[room,checkpoint]);
  }
  throw fail('physical_operation_v3_policy');
 };
 return Object.freeze({restore_segmented:restore('restore_segmented'),restore_continued_history:restore('restore_continued_history')});
}
export function snapshotPhysicalOperationV3Policy<T>(input:T):T{
 const active=new Set<object>();let nodes=0;
 const visit=(value:unknown,path:string,depth:number,profilePath?:string):unknown=>{
  if(++nodes>65536||depth>64)throw fail('physical_operation_v3_budget');
  if(value===null||value===undefined||typeof value==='string'||typeof value==='boolean'||typeof value==='function')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw fail('physical_operation_v3_policy');return value;}
  if(typeof value!=='object')throw fail('physical_operation_v3_policy');
  // Inspect the actual selected object BEFORE copying. Cloning its enumerable
  // fields must not erase a runtime-only driver, origin or bootstrap grant and
  // accidentally admit that object as a fresh ordinary host factory.
  if(independentDeliveryCompanion(value)||selectedLocalOperationDriver(value)||independentBootstrapPolicy(value)||independentBootstrapSignal(value)||independentLocalHistoryCapturePolicy(value))throw fail('physical_operation_v3_policy');
  // These contracts deliberately retain an actual host handle, not a DTO.
  if(path===profilePath)return continuedProfile(value);
  if(path.endsWith('/signal')||path.endsWith('/transport'))return value;
  if((path===''||path==='/*'||path==='/participants/*')&&own(value,'family')==='generation'&&
     own(own(own(value,'recovery'),'session'),'kind')==='continued-local'){
   profilePath=path+'/recovery/session/options/profile';
  }
  if(active.has(value))throw fail('physical_operation_v3_policy');active.add(value);
  try{
   if(Array.isArray(value))return Object.freeze(operationV3Rows(value,item=>visit(item,path+'/*',depth+1,profilePath)));
   const prototype=Object.getPrototypeOf(value);if(prototype!==null&&prototype!==Object.prototype)throw fail('physical_operation_v3_policy');
   const copy:Record<string,unknown>={};for(const field of Reflect.ownKeys(value)){
    if(typeof field!=='string'||field==='__proto__')throw fail('physical_operation_v3_policy');
    const descriptor=Object.getOwnPropertyDescriptor(value,field);if(!descriptor||!descriptor.enumerable||!('value'in descriptor))throw fail('physical_operation_v3_policy');
    Object.defineProperty(copy,field,{value:visit(descriptor.value,path+'/'+escapePath(field),depth+1,profilePath),enumerable:true});
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
