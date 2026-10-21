/** Inspect one actual storage context, never create a placeholder or repair intent. */
import {checkPhysicalRoomOperation,type PhysicalRoomOperationRecord} from "./record.js";
import {physicalOperationStore,physicalOperationSchema,physicalOperationShape} from "./schema.js";
import {physicalOperationFailure as fail,physicalOperationKnown as known} from "./policy.js";
export function existingPhysicalRoomOperationDatabase(factory:IDBFactory,name:string,guard:()=>void):Promise<IDBDatabase|undefined>{
 guard();return new Promise((resolve,reject)=>{const request=factory.open(name);let missing=false,blocked=false;
  request.onupgradeneeded=()=>{missing=true;request.transaction!.abort();};request.onerror=()=>missing?resolve(undefined):reject(fail());request.onblocked=()=>{blocked=true;reject(fail("physical_operation_in_use"));};
  request.onsuccess=()=>{try{if(blocked)throw fail("physical_operation_in_use");guard();resolve(request.result);}catch(error){request.result.close();reject(known(error));}};
 });
}
export function readPhysicalRoomOperationDatabase(db:IDBDatabase,guard:()=>void,expected?:PhysicalRoomOperationRecord):Promise<PhysicalRoomOperationRecord>{
 guard();physicalOperationSchema(db);return new Promise((resolve,reject)=>{
  const tx=db.transaction(physicalOperationStore,"readonly"),store=tx.objectStore(physicalOperationStore);let record:PhysicalRoomOperationRecord|undefined,reason:unknown;
  const abort=(error:unknown)=>{reason=known(error,"physical_operation_diverged");try{tx.abort();}catch{}};
  tx.onabort=()=>reject(reason??fail());tx.oncomplete=()=>{try{guard();if(!record)throw fail("physical_operation_diverged");resolve(record);}catch(error){reject(known(error,"physical_operation_diverged"));}};
  try{physicalOperationShape(store);}catch(error){abort(error);return;}
  store.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail("physical_operation_diverged");}catch(error){abort(error);}};
  store.get("state").onsuccess=e=>{try{guard();record=checkPhysicalRoomOperation((e.target as IDBRequest).result,expected);}catch(error){abort(error);}};
 });
}
