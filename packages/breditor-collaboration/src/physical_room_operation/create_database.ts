/** Absent-only atomic initial intent. Lost acknowledgement is recovered by explicit resume. */
import {checkPhysicalRoomOperation,type PhysicalRoomOperationRecord} from "./record.js";
import {physicalOperationStore} from "./schema.js";
import {physicalOperationFailure as fail,physicalOperationKnown as known} from "./policy.js";
export function createPhysicalRoomOperationDatabase(factory:IDBFactory,name:string,record:PhysicalRoomOperationRecord,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 guard();if(signal?.aborted)throw fail("physical_operation_aborted");const initial=checkPhysicalRoomOperation(record);
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,1);let created=false,blocked=false,reason:unknown;
  const abort=(error:unknown)=>{reason=known(error);try{request.transaction?.abort();}catch{}},cancel=()=>abort(fail("physical_operation_aborted")),done=()=>signal?.removeEventListener("abort",cancel);signal?.addEventListener("abort",cancel,{once:true});
  request.onupgradeneeded=event=>{try{guard();if(signal?.aborted)throw fail("physical_operation_aborted");if(blocked||event.oldVersion!==0)throw fail("physical_operation_exists");created=true;request.result.createObjectStore(physicalOperationStore).add(initial,"state");}catch(error){abort(error);}};
  request.onerror=()=>{done();reject(reason??fail(request.error?.name==="VersionError"?"physical_operation_exists":"physical_operation_storage"));};
  request.onblocked=()=>{blocked=true;done();reject(fail("physical_operation_exists"));};
  request.onsuccess=()=>{done();try{if(blocked||!created)throw fail("physical_operation_exists");guard();if(signal?.aborted)throw fail("physical_operation_aborted");resolve(request.result);}catch(error){request.result.close();reject(known(error));}};
 });
}
