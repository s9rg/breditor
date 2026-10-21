/** Absent-only atomic initial intent. Lost acknowledgement is recovered by explicit resume. */
import {checkPhysicalStageRecord,type PhysicalStageRecord} from "./record.js";
import {physicalStageStore} from "./schema.js";
import {physicalStageFailure as fail,physicalStageKnown as known} from "./policy.js";
export function createPhysicalStageDatabase(factory:IDBFactory,name:string,record:PhysicalStageRecord,guard:()=>void,signal?:AbortSignal):Promise<IDBDatabase>{
 guard();if(signal?.aborted)throw fail("physical_stage_aborted");const initial=checkPhysicalStageRecord(record);
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,1);let created=false,blocked=false,reason:unknown;
  const abort=(error:unknown)=>{reason=known(error);try{request.transaction?.abort();}catch{}},cancel=()=>abort(fail("physical_stage_aborted")),done=()=>signal?.removeEventListener("abort",cancel);signal?.addEventListener("abort",cancel,{once:true});
  request.onupgradeneeded=event=>{try{guard();if(signal?.aborted)throw fail("physical_stage_aborted");if(blocked||event.oldVersion!==0)throw fail("physical_stage_exists");created=true;request.result.createObjectStore(physicalStageStore).add(initial,"state");}catch(error){abort(error);}};
  request.onerror=()=>{done();reject(reason??fail(request.error?.name==="VersionError"?"physical_stage_exists":"physical_stage_storage"));};
  request.onblocked=()=>{blocked=true;done();reject(fail("physical_stage_exists"));};
  request.onsuccess=()=>{done();try{if(blocked||!created)throw fail("physical_stage_exists");guard();if(signal?.aborted)throw fail("physical_stage_aborted");resolve(request.result);}catch(error){request.result.close();reject(known(error));}};
 });
}
