/** Exact compare-and-set of one checked monotone transition. Never overwrites another plan. */
import {checkPhysicalRoomOperation,checkPhysicalRoomOperationTransition,type PhysicalRoomOperationRecord} from "./record.js";
import {physicalOperationStore,physicalOperationSchema,physicalOperationShape} from "./schema.js";
import {physicalOperationFailure as fail,physicalOperationKnown as known} from "./policy.js";
export function updatePhysicalRoomOperationRecord(db:IDBDatabase,before:PhysicalRoomOperationRecord,next:PhysicalRoomOperationRecord,guard:()=>void,signal?:AbortSignal):Promise<void>{
 guard();if(signal?.aborted)throw fail("physical_operation_aborted");checkPhysicalRoomOperationTransition(before,next);physicalOperationSchema(db);const expected=JSON.stringify(before),value=structuredClone(next);
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(physicalOperationStore,"readwrite",{durability:"strict"}),store=tx.objectStore(physicalOperationStore);let reason:unknown;
  const abort=(error:unknown)=>{reason=known(error);try{tx.abort();}catch{}},cancel=()=>abort(fail("physical_operation_aborted"));signal?.addEventListener("abort",cancel,{once:true});const done=()=>signal?.removeEventListener("abort",cancel);
  tx.onabort=()=>{done();reject(reason??fail());};tx.oncomplete=()=>{done();resolve();};
  try{physicalOperationShape(store);}catch(error){abort(error);return;}
  store.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail("physical_operation_diverged");}catch(error){abort(error);}};
  store.get("state").onsuccess=e=>{try{guard();if(signal?.aborted)throw fail("physical_operation_aborted");if(JSON.stringify(checkPhysicalRoomOperation((e.target as IDBRequest).result,before))!==expected)throw fail("physical_operation_diverged");store.put(value,"state");}catch(error){abort(error);}};
 });
}
