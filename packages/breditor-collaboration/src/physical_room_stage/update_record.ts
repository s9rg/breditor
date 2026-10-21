/** Exact compare-and-set of one checked monotone transition. Never overwrites another plan. */
import {checkPhysicalStageRecord,checkPhysicalStageTransition,type PhysicalStageRecord} from "./record.js";
import {physicalStageStore,physicalStageSchema,physicalStageShape} from "./schema.js";
import {physicalStageFailure as fail,physicalStageKnown as known} from "./policy.js";
export function updatePhysicalStageRecord(db:IDBDatabase,before:PhysicalStageRecord,next:PhysicalStageRecord,guard:()=>void,signal?:AbortSignal):Promise<void>{
 guard();if(signal?.aborted)throw fail("physical_stage_aborted");checkPhysicalStageTransition(before,next);physicalStageSchema(db);const expected=JSON.stringify(before),value=structuredClone(next);
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(physicalStageStore,"readwrite",{durability:"strict"}),store=tx.objectStore(physicalStageStore);let reason:unknown;
  const abort=(error:unknown)=>{reason=known(error);try{tx.abort();}catch{}},cancel=()=>abort(fail("physical_stage_aborted"));signal?.addEventListener("abort",cancel,{once:true});const done=()=>signal?.removeEventListener("abort",cancel);
  tx.onabort=()=>{done();reject(reason??fail());};tx.oncomplete=()=>{done();resolve();};
  try{physicalStageShape(store);}catch(error){abort(error);return;}
  store.count().onsuccess=e=>{try{guard();if((e.target as IDBRequest<number>).result!==1)throw fail("physical_stage_diverged");}catch(error){abort(error);}};
  store.get("state").onsuccess=e=>{try{guard();if(signal?.aborted)throw fail("physical_stage_aborted");if(JSON.stringify(checkPhysicalStageRecord((e.target as IDBRequest).result,{database:before.catalogDatabase,manifest:before.manifest,selection:before.catalog}))!==expected)throw fail("physical_stage_diverged");store.put(value,"state");}catch(error){abort(error);}};
 });
}
