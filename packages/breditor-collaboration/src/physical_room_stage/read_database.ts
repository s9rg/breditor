/** Inspect one actual storage context, never create a placeholder or repair intent. */
import {checkPhysicalStageRecord,type PhysicalStageRecord,type PhysicalStageSource} from "./record.js";
import {physicalStageStore,physicalStageSchema,physicalStageShape} from "./schema.js";
import {physicalStageFailure as fail,physicalStageKnown as known} from "./policy.js";
export function existingPhysicalStageDatabase(factory:IDBFactory,name:string,guard:()=>void):Promise<IDBDatabase|undefined>{
 guard();return new Promise((resolve,reject)=>{const request=factory.open(name);let missing=false,blocked=false;
  request.onupgradeneeded=()=>{missing=true;request.transaction!.abort();};request.onerror=()=>missing?resolve(undefined):reject(fail());request.onblocked=()=>{blocked=true;reject(fail("physical_stage_in_use"));};
  request.onsuccess=()=>{try{if(blocked)throw fail("physical_stage_in_use");guard();resolve(request.result);}catch(error){request.result.close();reject(known(error));}};
 });
}
export function readPhysicalStageDatabase(db:IDBDatabase,guard:()=>void,source?:PhysicalStageSource):Promise<PhysicalStageRecord>{
 guard();physicalStageSchema(db);return new Promise((resolve,reject)=>{
  const tx=db.transaction(physicalStageStore,"readonly"),store=tx.objectStore(physicalStageStore);let record:PhysicalStageRecord|undefined,reason:unknown;
  const abort=(error:unknown)=>{reason=known(error,"physical_stage_diverged");try{tx.abort();}catch{}};
  tx.onabort=()=>reject(reason??fail());tx.oncomplete=()=>{try{guard();if(!record)throw fail("physical_stage_diverged");resolve(record);}catch(error){reject(known(error,"physical_stage_diverged"));}};
  try{physicalStageShape(store);}catch(error){abort(error);return;}
  store.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail("physical_stage_diverged");}catch(error){abort(error);}};
  store.get("state").onsuccess=e=>{try{guard();record=checkPhysicalStageRecord((e.target as IDBRequest).result,source);}catch(error){abort(error);}};
 });
}
